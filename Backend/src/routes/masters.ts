import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, readTable } from "../services/sheets.js";
import { nextSequentialId } from "../services/ids.js";
import { requireAuth } from "../middleware/auth.js";

export const mastersRouter = Router();
mastersRouter.use(requireAuth);

const refresh = (q: unknown) => q === "true" || q === "1";

// CUSTOMER MASTER T1 is the real customer master (577+ live customers, migrated from the
// old ADC system). Its field names sit on row 2 — row 1 is a group-header/summary row.
const CUSTOMER_TAB = "CUSTOMER MASTER T1";
const CUSTOMER_HEADER_ROW = 2;

mastersRouter.get("/customers", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.customerBilling, CUSTOMER_TAB, {
      refresh: refresh(req.query.refresh),
      headerRow: CUSTOMER_HEADER_ROW,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** Joins the customer's core row with its billing address(es) and contact(s). */
mastersRouter.get("/customers/:custId", async (req, res, next) => {
  try {
    const { custId } = req.params;
    const [customers, addresses, contacts] = await Promise.all([
      readTable(env.sheets.customerBilling, CUSTOMER_TAB, { headerRow: CUSTOMER_HEADER_ROW }),
      readTable(env.sheets.customerBilling, "Customer Addresses"),
      readTable(env.sheets.customerBilling, "Customer Contacts"),
    ]);

    const customer = customers.find((c) => c["CUST ID"] === custId);
    if (!customer) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Customer not found" } });
    }

    // The clean "Customer Addresses"/"Customer Contacts" tabs only cover customers created
    // through this app. For T1's legacy customers, fall back to the billing columns already
    // present on their own row so the Billing Address tab can still auto-fill.
    let matchedAddresses = addresses.filter((a) => a["Customer ID"] === custId);
    if (matchedAddresses.length === 0 && customer["BILLING ADDRESS"]) {
      matchedAddresses = [
        {
          "Customer ID": custId,
          "Address Type": "Billing",
          "Full Address": customer["BILLING ADDRESS"] || "",
          "Address Line 1": customer["BILLING ADDRESS"] || "",
          State: customer["Billing STATE"] || "",
          "Pin Code": customer["Billing PIN CODE"] || "",
          Country: customer["Billing Contry"] || "India",
        },
      ];
    }

    res.json({
      customer,
      addresses: matchedAddresses,
      contacts: contacts.filter((c) => c["Customer ID"] === custId),
    });
  } catch (err) {
    next(err);
  }
});

const newCustomerSchema = z.object({
  customerName: z.string().min(1),
  gstin: z.string().optional().default(""),
  panNo: z.string().optional().default(""),
  contactPersonName: z.string().optional().default(""),
  contactNo: z.string().optional().default(""),
  email: z.string().optional().default(""),
  paymentTermsDays: z.number().optional(),
  billingAddressLine1: z.string().min(1),
  billingAddressLine2: z.string().optional().default(""),
  billingCity: z.string().optional().default(""),
  billingState: z.string().min(1),
  billingStateCode: z.string().optional().default(""),
  billingPincode: z.string().min(1),
  billingCountry: z.string().optional().default("India"),
});

/** Inline "Add New Customer" from Order Punch — writes straight into the master, no approval step. */
mastersRouter.post("/customers", async (req, res, next) => {
  try {
    const body = newCustomerSchema.parse(req.body);
    const now = new Date().toISOString();
    const custId = await nextSequentialId(
      env.sheets.customerBilling,
      CUSTOMER_TAB,
      "CUST ID",
      "CUST-",
      4,
      CUSTOMER_HEADER_ROW
    );

    const joinDate = new Date(now);
    const joinDateStr = [
      String(joinDate.getDate()).padStart(2, "0"),
      String(joinDate.getMonth() + 1).padStart(2, "0"),
      joinDate.getFullYear(),
    ].join("-");

    await appendRow(
      env.sheets.customerBilling,
      CUSTOMER_TAB,
      {
        "DATE OF JOINING ADC": joinDateStr,
        "CUST ID": custId,
        "CUSTOMER NAME": body.customerName,
        "Payment Terms With Days": body.paymentTermsDays !== undefined ? String(body.paymentTermsDays) : "",
        "Company GSTIN NO.": body.gstin,
        "Company PAN NO.": body.panNo,
        "REGISTERED EMAIL ID": body.email,
        "REGISTERED MOBILE NO.": body.contactNo,
        "BILLING ADDRESS": [body.billingAddressLine1, body.billingAddressLine2].filter(Boolean).join(", "),
        "Billing STATE": body.billingState,
        "Billing PIN CODE": body.billingPincode,
        "Billing Contry": body.billingCountry,
      },
      CUSTOMER_HEADER_ROW
    );

    await appendRow(env.sheets.customerBilling, "Customer Addresses", {
      Timestamp: now,
      Useremail: req.user!.email,
      "Customer ID": custId,
      "Address ID": `${custId}-ADDR-01`,
      "Address Type": "Billing",
      "Full Address": [body.billingAddressLine1, body.billingAddressLine2].filter(Boolean).join(", "),
      "Address Line 1": body.billingAddressLine1,
      "Address Line 2": body.billingAddressLine2,
      "Pin Code": body.billingPincode,
      City: body.billingCity,
      State: body.billingState,
      "State Code": body.billingStateCode,
      Country: body.billingCountry,
      "Address Status": "Active",
    });

    if (body.contactPersonName) {
      await appendRow(env.sheets.customerBilling, "Customer Contacts", {
        Timestamp: now,
        Useremail: req.user!.email,
        "Customer ID": custId,
        "Contact ID": `${custId}-CONT-01`,
        "Contact Person Name": body.contactPersonName,
        "Contact No. 1": body.contactNo,
        "Email ID": body.email,
        "Contact Status": "Active",
      });
    }

    res.status(201).json({
      custId,
      customerName: body.customerName,
      gstin: body.gstin,
      billingAddressLine1: body.billingAddressLine1,
      billingAddressLine2: body.billingAddressLine2,
      billingState: body.billingState,
      billingPincode: body.billingPincode,
      billingCountry: body.billingCountry,
    });
  } catch (err) {
    next(err);
  }
});

mastersRouter.get("/billing-strategies", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.customerBilling, "BILLING STRATEGY MASTER", {
      refresh: refresh(req.query.refresh),
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

mastersRouter.get("/transporters", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.transport, "Transporter Data", {
      refresh: refresh(req.query.refresh),
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

mastersRouter.get("/goods", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.fg, "MASTER OF FG INVENTORY", {
      refresh: refresh(req.query.refresh),
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const newPartSchema = z.object({
  partName: z.string().min(1),
  partNo: z.string().optional().default(""),
  segment: z.string().optional().default(""),
  category: z.string().optional().default(""),
  unit: z.string().optional().default("NOS"),
  price: z.number().optional(),
});

/** Inline "Add New Part" from Order Punch — writes straight into the FG master, no approval step. */
mastersRouter.post("/goods", async (req, res, next) => {
  try {
    const body = newPartSchema.parse(req.body);
    const now = new Date().toISOString();
    const fgId = await nextSequentialId(env.sheets.fg, "MASTER OF FG INVENTORY", "FG ID", "");

    await appendRow(env.sheets.fg, "MASTER OF FG INVENTORY", {
      TIMESTAMP: now,
      USEREMAIL: req.user!.email,
      "FG ID": fgId,
      "PART NO.": body.partNo,
      SEGMENT: body.segment,
      CATEGORY: body.category,
      Name: body.partName,
      UNIT: body.unit,
      price: body.price !== undefined ? String(body.price) : "",
    });

    res.status(201).json({
      fgId,
      partName: body.partName,
      partNo: body.partNo,
      segment: body.segment,
      category: body.category,
      unit: body.unit,
      price: body.price,
    });
  } catch (err) {
    next(err);
  }
});
