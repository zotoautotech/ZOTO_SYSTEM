import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, readTable } from "../services/sheets.js";
import { nextSequentialId } from "../services/ids.js";
import { requireAuth } from "../middleware/auth.js";

export const mastersRouter = Router();
mastersRouter.use(requireAuth);

const refresh = (q: unknown) => q === "true" || q === "1";

mastersRouter.get("/customers", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.customerBilling, "CUSTOMER MASTER V2", {
      refresh: refresh(req.query.refresh),
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
      readTable(env.sheets.customerBilling, "CUSTOMER MASTER V2"),
      readTable(env.sheets.customerBilling, "Customer Addresses"),
      readTable(env.sheets.customerBilling, "Customer Contacts"),
    ]);

    const customer = customers.find((c) => c["Customer Code"] === custId);
    if (!customer) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Customer not found" } });
    }

    res.json({
      customer,
      addresses: addresses.filter((a) => a["Customer ID"] === custId),
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
      "CUSTOMER MASTER V2",
      "Customer Code",
      "CUST-"
    );

    await appendRow(env.sheets.customerBilling, "CUSTOMER MASTER V2", {
      Timestamp: now,
      Useremail: req.user!.email,
      "Customer Code": custId,
      "Customer Name": body.customerName,
      "Payment Terms With Days": body.paymentTermsDays !== undefined ? `${body.paymentTermsDays} DAYS` : "",
      "Company GSTIN NO.": body.gstin,
      "Company PAN NO.": body.panNo,
      "Registered Email ID": body.email,
      "Registered Contact No.": body.contactNo,
      "Joining Date": now,
    });

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
