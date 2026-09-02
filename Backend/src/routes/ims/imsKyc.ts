/** IMS KYC — Customer KYC pending queue (IMS_SHEET_FG_ID) + copy-into-Master-Customer-Data
 * flow, matching the reference's CUSTOMER MASTER V2 -> MASTER CUSTOMER DATA copy. */
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, readTable } from "../../services/sheets.js";
import { requireAuth, requireModule } from "../../middleware/auth.js";

export const imsKycRouter = Router();
imsKycRouter.use(requireAuth);

const refresh = (q: unknown) => q === "true" || q === "1";

/** Pending queue — blank Reviews Status. */
imsKycRouter.get("/pending", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsFg, "Customer KYC", { refresh: refresh(req.query.refresh) });
    res.json(rows.filter((r) => !r["Reviews Status"]));
  } catch (err) {
    next(err);
  }
});

/** Search CUSTOMER MASTER V2 by name/code, for the "copy an existing customer into KYC" flow. */
imsKycRouter.get("/search", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (!q) return res.json([]);
    const rows = await readTable(env.sheets.imsCustomer, "CUSTOMER MASTER V2");
    const matches = rows.filter(
      (r) => (r["Customer Name"] ?? "").toLowerCase().includes(q) || (r["Customer Code"] ?? "").toLowerCase().includes(q)
    );
    res.json(matches.slice(0, 25));
  } catch (err) {
    next(err);
  }
});

const kycSchema = z.object({
  customerCode: z.string().min(1),
});

/** Copies one CUSTOMER MASTER V2 row's KYC-relevant fields into MASTER CUSTOMER DATA,
 * joined with Customer Addresses/Contacts/Revisions the same way the reference's
 * buildMasterDataRow() does — see docs/work/ims-sheet-header-spec.md item 10. */
imsKycRouter.post("/create", requireModule("ims-kyc"), async (req, res, next) => {
  try {
    const { customerCode } = kycSchema.parse(req.body);
    const [customers, addresses, contacts, revisions] = await Promise.all([
      readTable(env.sheets.imsCustomer, "CUSTOMER MASTER V2"),
      readTable(env.sheets.imsCustomer, "Customer Addresses").catch(() => []),
      readTable(env.sheets.imsCustomer, "Customer Contacts").catch(() => []),
      readTable(env.sheets.imsCustomer, "Customer Revisions").catch(() => []),
    ]);
    const customer = customers.find((c) => c["Customer Code"] === customerCode);
    if (!customer) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Customer not found" } });

    const address = addresses.find((a) => a["Customer ID"] === customer["Customer ID"] && (a["Address Type"] ?? "").toLowerCase() === "registered");
    const contact = contacts.find((c) => c["Customer ID"] === customer["Customer ID"]);
    const revision = revisions.find((r) => r["Customer ID"] === customer["Customer ID"]);

    const gstin = customer["Company GSTIN NO."] ?? "";
    await appendRow(env.sheets.imsMasterCust, "MASTER CUSTOMER DATA", {
      Timestamp: new Date().toISOString(),
      "CUSTOMER NAME": customer["Customer Name"] ?? "",
      "Status Of Customer Manual": "EXISTING",
      "Customer Category": customer["Customer Category"]
        ? `${customer["Customer Category"]} Category ${customer["Customer Category (%)"] ?? ""}%`
        : "",
      "Business Segment": customer["Business Segment"] ?? "",
      "TYPE OF CUSTOMER": (customer["Business Type"] ?? "").toUpperCase(),
      "KYC REQUIRED": "Yes",
      "KYC STATUS": "OK",
      "Company GSTIN NO.": gstin,
      "REGISTERED MOBILE NO.": customer["Registered Contact No."] ?? "",
      "Registered Full Address": address?.["Full Address"] ?? "",
      "Registered City": address?.City ?? "",
      "Registered Country": "INDIA",
      "Registered State": address?.State ?? "",
      "Registered Pin Code": address?.["Pin Code"] ?? "",
      "Select addres": "GSTIN REG.",
      "Billing Full Address": address?.["Full Address"] ?? "",
      "Billing City": address?.City ?? "",
      "Billing Country": "INDIA",
      "Billing State": address?.State ?? "",
      "Billing Pin Code": address?.["Pin Code"] ?? "",
      "Billing PLACE OF SUPPLY": address?.State ?? "",
      "Ship 1 label": "Ship1",
      "Ship 1 GSTIN": gstin,
      "Ship 1 PAN": gstin.slice(2, 12),
      "Ship 1 Name": customer["Customer Name"] ?? "",
      "Ship 1 Full Address": address?.["Full Address"] ?? "",
      "Ship 1 City": address?.City ?? "",
      "Ship 1 Country": "India",
      "CONTACT PERSON NAME": contact?.["Contact Person Name"] ?? "",
      "MOBILE NO. 1": contact?.["Contact No. 1"] ?? "",
      DESIGNATION: contact?.["Contact Person Designation"] ?? "",
      "BILLING PAYMENT TERMS EDIT": customer["Payment terms (Days)"] ?? "",
      "GRACE DAYS EDIT": revision?.["Grace Period (Days)"] ?? "",
      "CUSTOMER MARKA CODE": customer["Marka Code"] ?? "",
      "Account Type": customer["Account Type"] || "Customer",
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
