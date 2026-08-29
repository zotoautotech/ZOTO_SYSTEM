import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, readTable, updateRow } from "../../services/sheets.js";
import { nextSequentialId } from "../../services/ids.js";
import { hasNpdRole } from "../npdPermissions.js";
import { getCatalogTable } from "./taxonomy.js";

/**
 * Customer Onboarding & KYC (build-prompt §5.5): New Raise Request -> Customer KYC -> publish
 * to CUSTOMER MASTER V2. Both `New Raise Request` and `Customer KYC` are draft/staging tabs
 * (new, on env.sheets.npd, trimmed field sets — see NPD/CONTEXT.md); `CUSTOMER MASTER V2` is
 * the published record, reusing taxonomy.ts's generic CRUD (see its own TABLES entry) the same
 * way fg-sku/rm-sku do. `Customer Data` (the workbook's separate "extended commercial/CRM
 * profile" tab) is deliberately NOT built as a second near-duplicate tab — its fields overlap
 * heavily with CUSTOMER MASTER V2's own Financial Details section, and this app has no CRM
 * module yet to justify a second profile tab. Revisit only if a real need for CRM-specific
 * fields distinct from the customer master shows up.
 */
export const customerRouter = Router();

const RAISE_TAB = "New Raise Request";
const RAISE_ID_COLUMN = "Request ID";
const KYC_TAB = "Customer KYC";
const KYC_ID_COLUMN = "KYC ID";

// --- New Raise Request ---

customerRouter.get("/raise-requests", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await readTable(env.sheets.npd, RAISE_TAB);
    res.json({ requests: status ? rows.filter((r) => r.Status === status) : rows });
  } catch (err) {
    next(err);
  }
});

const RaiseRequestSchema = z.object({
  customerName: z.string().trim().min(1),
  contactNo: z.string().trim().optional(),
  email: z.string().trim().optional(),
  address: z.string().trim().optional(),
  creditDays: z.number().nonnegative().optional(),
  gracePeriod: z.number().nonnegative().optional(),
  tdsTcsApplicable: z.string().trim().optional(),
});

customerRouter.post("/raise-requests", async (req, res, next) => {
  try {
    const body = RaiseRequestSchema.parse(req.body);
    const id = await nextSequentialId(env.sheets.npd, RAISE_TAB, RAISE_ID_COLUMN, "NRR");
    await appendRow(env.sheets.npd, RAISE_TAB, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      [RAISE_ID_COLUMN]: id,
      "Customer Name": body.customerName,
      "Contact No.": body.contactNo ?? "",
      Email: body.email ?? "",
      Address: body.address ?? "",
      "Credit Days": body.creditDays !== undefined ? String(body.creditDays) : "",
      "Grace Period": body.gracePeriod !== undefined ? String(body.gracePeriod) : "",
      "TDS TCS Applicable": body.tdsTcsApplicable ?? "",
      Status: "Pending",
    });
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

// --- Customer KYC ---

customerRouter.get("/kyc", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await readTable(env.sheets.npd, KYC_TAB);
    res.json({ kyc: status ? rows.filter((r) => r["KYC Status"] === status) : rows });
  } catch (err) {
    next(err);
  }
});

const KycSchema = z.object({
  requestId: z.string().trim().optional(),
  customerName: z.string().trim().min(1),
  gstin: z.string().trim().optional(),
  pan: z.string().trim().optional(),
  nameOnPan: z.string().trim().optional(),
  registeredEmail: z.string().trim().optional(),
  registeredContactNo: z.string().trim().optional(),
  firmType: z.string().trim().optional(),
  documents: z.string().trim().optional(),
});

customerRouter.post("/kyc", async (req, res, next) => {
  try {
    const body = KycSchema.parse(req.body);
    const id = await nextSequentialId(env.sheets.npd, KYC_TAB, KYC_ID_COLUMN, "KYC");
    await appendRow(env.sheets.npd, KYC_TAB, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      [KYC_ID_COLUMN]: id,
      "Request ID": body.requestId ?? "",
      "Customer Name": body.customerName,
      GSTIN: body.gstin ?? "",
      PAN: body.pan ?? "",
      "Name on PAN": body.nameOnPan ?? "",
      "Registered Email": body.registeredEmail ?? "",
      "Registered Contact No.": body.registeredContactNo ?? "",
      "Firm Type": body.firmType ?? "",
      Documents: body.documents ?? "",
      "KYC Status": "Pending",
    });
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

const KycDecisionSchema = z.object({
  decision: z.enum(["Approved", "Rejected"]),
  remarks: z.string().trim().optional(),
});

/** Approving a KYC publishes it straight into CUSTOMER MASTER V2 (Sales/Admin only — matches
 * the build prompt's Roles table: "Sales/CRM: Customer Master, KYC, New Raise Request..."). If
 * the KYC references a Request ID, its financial terms (Credit Days/Grace Period/TDS-TCS) are
 * carried over onto the published row too — the KYC tab itself doesn't collect those, they
 * only ever lived on the Raise Request. */
customerRouter.post("/kyc/:id/decide", async (req, res, next) => {
  try {
    const allowed = await hasNpdRole(req.user!.employeeId, ["sales"]);
    if (!allowed) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Sales/CRM or Admin only" } });

    const body = KycDecisionSchema.parse(req.body);
    const kycRows = await readTable(env.sheets.npd, KYC_TAB, { refresh: true });
    const kyc = kycRows.find((r) => r[KYC_ID_COLUMN] === req.params.id);
    if (!kyc) return res.status(404).json({ error: { code: "NOT_FOUND", message: "KYC record not found" } });
    if (kyc["KYC Status"] !== "Pending") {
      return res.status(409).json({ error: { code: "ALREADY_DECIDED", message: `Already ${kyc["KYC Status"]}` } });
    }

    await updateRow(env.sheets.npd, KYC_TAB, KYC_ID_COLUMN, req.params.id, {
      "KYC Status": body.decision,
      Remarks: body.remarks ?? "",
    });

    let customerId: string | undefined;
    if (body.decision === "Approved") {
      let creditDays = "";
      let gracePeriod = "";
      let tdsTcs = "";
      let contactNo = kyc["Registered Contact No."] ?? "";
      let email = kyc["Registered Email"] ?? "";
      if (kyc["Request ID"]) {
        const raiseRows = await readTable(env.sheets.npd, RAISE_TAB);
        const raise = raiseRows.find((r) => r[RAISE_ID_COLUMN] === kyc["Request ID"]);
        if (raise) {
          creditDays = raise["Credit Days"] ?? "";
          gracePeriod = raise["Grace Period"] ?? "";
          tdsTcs = raise["TDS TCS Applicable"] ?? "";
          contactNo = contactNo || raise["Contact No."] || "";
          email = email || raise.Email || "";
        }
      }

      const table = getCatalogTable("customer-master-v2");
      customerId = await nextSequentialId(table.spreadsheetId, table.tab, table.idColumn, table.idPrefix);
      await appendRow(table.spreadsheetId, table.tab, {
        [table.idColumn]: customerId,
        [table.timestampField]: new Date().toISOString(),
        [table.useremailField!]: req.user!.employeeId,
        "Customer Name": kyc["Customer Name"],
        "Customer Status": "Active",
        GSTIN: kyc.GSTIN ?? "",
        PAN: kyc.PAN ?? "",
        "Contact No.": contactNo,
        Email: email,
        "Credit Days": creditDays,
        "Grace Period": gracePeriod,
        "TDS TCS Applicable": tdsTcs,
      });
    }

    res.json({ id: req.params.id, decision: body.decision, customerId });
  } catch (err) {
    next(err);
  }
});
