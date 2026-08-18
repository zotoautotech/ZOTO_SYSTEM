import type { docs_v1 } from "googleapis";
import { env } from "../config/env.js";
import { getDocsClient, getDriveClientForDocs } from "./googleAuth.js";
import { uploadBufferToDrive } from "./drive.js";

/**
 * Generates the Sale Order PDF from the "Sale Order Template T2" Google Doc, the same way
 * gatePass.ts fills the Dispatch Gate Pass template: copy the template, fill its repeating
 * item row, replace the scalar <<[Field]>> tokens, export to PDF, upload the PDF as a normal
 * private Drive file and delete the intermediate Doc copy.
 *
 * Unlike the gate pass template, this one's item table really does have exactly one cell per
 * visible column (10) — confirmed by dumping the live template's cell structure rather than
 * assuming, since the doer has edited this template by hand since it was created. The header
 * row is never edited, so its "Sl No." text is used as a stable anchor to re-find the table
 * after each edit shifts the document's character indices.
 */
const ITEM_TABLE_HEADER_ANCHOR = "Sl No.";
const ITEM_ROW_COLUMN_COUNT = 10;
const FIRST_ITEM_ROW_INDEX = 1; // row 0 is the header row

/** Several address/state columns in ORDER_PUNCH hold the literal string "NA" rather than
 * being genuinely blank (a punch-time default for fields the doer skipped). Printed as-is on
 * the Sale Order, "State Name: NA" reads worse than just leaving it empty — callers should
 * run every such field through this before handing it to generateSaleOrderPdf(), so a
 * missing value renders as a blank line, not a literal "NA" or an unresolved token. */
export function blankIfNA(value: string | undefined | null): string {
  const v = (value ?? "").trim();
  return v.toUpperCase() === "NA" ? "" : v;
}

export interface SaleOrderDocItem {
  partNo: string;
  partName: string;
  hsn: string;
  dueOn: string;
  quantity: string;
  unit: string;
  price: string;
  discountPct: string;
  basicAmount: string;
}

export interface SaleOrderDocFields {
  saleOrderNo: string;
  saleOrderDate: string;
  paymentType: string;
  customerName: string;
  purchaseOrderNo: string;
  saleOrderRemarks: string;
  consigneeName: string;
  preferredDeliveryMode: string;
  preferredTransporterName: string;
  shippingState: string;
  roundOff: string;
  totalQuantity: string;
  totalAmount: string;
  amountInWords: string;
  /** Only the GST system's template (T1) has these tokens (Output CGST/SGST Tax Payable
   * rows, "for <<[Branch Name]>>" signature line) — harmless no-ops on the tax-free
   * template (T2), since replaceAllText matching zero occurrences of a token is not an
   * error, it just does nothing. Optional so System 2's caller doesn't need to pass them. */
  cgstTotal?: string;
  sgstTotal?: string;
  /** Only relevant on T1 (System 1 is GST-enabled) — T1's item table carries a third
   * "Output IGST Tax Payable" row alongside CGST/SGST, filled for inter-state orders. An
   * order is always either CGST+SGST (intra-state) or IGST (inter-state), never a mix, since
   * splitGst() decides that once for the whole order — see removeTaxRowLabels below, which
   * the caller uses to delete whichever pair doesn't apply so the PDF doesn't show two
   * "0.00" tax rows next to the one that actually applies. */
  igstTotal?: string;
  branchName?: string;
  /** T1's original, unedited header block still carries the full seller/buyer/consignee
   * address+GSTIN token set from the initial build — T2's header was since hand-edited down
   * to a plain hardcoded letterhead with none of these, so passing them there is a no-op.
   * Buyer PAN / Billing & Shipping "State Code" have no source column anywhere in either
   * sheet, so those three tokens are left unresolved by design, not a bug — flagged to the
   * user when this template was first delivered. */
  sellerAddressLine1?: string;
  sellerAddressLine2?: string;
  sellerState?: string;
  sellerPincode?: string;
  sellerEmail?: string;
  sellerGstin?: string;
  billingAddressLine1?: string;
  billingAddressLine2?: string;
  billingState?: string;
  buyerGstin?: string;
  consigneeGstin?: string;
  shippingAddressLine1?: string;
  shippingAddressLine2?: string;
}

function cellText(cell: docs_v1.Schema$TableCell): string {
  let text = "";
  for (const el of cell.content ?? []) {
    for (const pe of el.paragraph?.elements ?? []) {
      text += pe.textRun?.content ?? "";
    }
  }
  return text;
}

function locateItemTable(doc: docs_v1.Schema$Document): { tableStartIndex: number; table: docs_v1.Schema$Table } {
  for (const el of doc.body?.content ?? []) {
    if (!el.table || el.startIndex === undefined || el.startIndex === null) continue;
    const headerText = (el.table.tableRows?.[0]?.tableCells ?? []).map(cellText).join(" ");
    if (headerText.includes(ITEM_TABLE_HEADER_ANCHOR)) {
      return { tableStartIndex: el.startIndex, table: el.table };
    }
  }
  throw new Error(`Sale order template: item table not found (looking for header "${ITEM_TABLE_HEADER_ANCHOR}")`);
}

/** Which field sits in columns 1-3 differs between templates: T2 (default) keeps the
 * original Part No. / Description / HSN-SAC order; T1 was reordered to Description /
 * HSN-SAC / Part No. to match the ADC reference invoice exactly. Columns 0 and 4-9 are
 * identical in both. */
export type ColumnLayout = "default" | "descriptionFirst";

function valueForCell(item: SaleOrderDocItem, srNo: number, cellIndex: number, layout: ColumnLayout): string {
  if (cellIndex === 0) return String(srNo);
  if (cellIndex === 1) return layout === "descriptionFirst" ? item.partName : item.partNo;
  if (cellIndex === 2) return layout === "descriptionFirst" ? item.hsn : item.partName;
  if (cellIndex === 3) return layout === "descriptionFirst" ? item.partNo : item.hsn;
  switch (cellIndex) {
    case 4: return item.dueOn;
    case 5: return [item.quantity, item.unit].filter(Boolean).join(" ");
    case 6: return item.price;
    case 7: return item.unit;
    case 8: return item.discountPct;
    case 9: return item.basicAmount;
    default: return "";
  }
}

/**
 * Fills the whole item table in a small, constant number of Google API calls, regardless of
 * item count — the original version re-fetched the whole document and issued a separate
 * batchUpdate for every single CELL (up to 20 calls per row), which meant a 13-item order
 * made 250+ sequential API calls and reliably tripped Google's per-minute quota.
 *
 * Two facts make batching safe here:
 *  1. Every blank row is interchangeable (no content differentiates them), so all of the
 *     rows this order needs beyond the template's one starter row — extra item rows AND
 *     `minRows` padding rows alike — can be inserted in ONE batchUpdate, all targeting the
 *     SAME base row index. The API applies requests in array order, and re-inserting below
 *     the same original row N times just stacks N blank rows below it — which row ends up
 *     "third" doesn't matter since they're identical until filled.
 *  2. Docs character positions only shift AFTER the point of an edit, never before it. So if
 *     every fill request is ordered from the LAST row/cell in the table back to the FIRST,
 *     each one only touches document range at or after its own position — never invalidating
 *     the (already-read) positions still queued for earlier rows/cells later in the batch.
 *     That lets every delete+insert pair for the entire table ride in one single batchUpdate,
 *     built from one single up-front document read.
 */
async function fillItemTable(
  docs: docs_v1.Docs,
  documentId: string,
  items: SaleOrderDocItem[],
  layout: ColumnLayout,
  minRows: number
) {
  if (items.length === 0) return;

  const totalRows = Math.max(items.length, minRows);
  const extraRows = totalRows - 1; // the template already has row 1 (the one starter row)

  if (extraRows > 0) {
    const doc = (await docs.documents.get({ documentId })).data;
    const { tableStartIndex } = locateItemTable(doc);
    const insertRequests: docs_v1.Schema$Request[] = Array.from({ length: extraRows }, () => ({
      insertTableRow: {
        tableCellLocation: {
          tableStartLocation: { index: tableStartIndex },
          rowIndex: FIRST_ITEM_ROW_INDEX,
          columnIndex: 0,
        },
        insertBelow: true,
      },
    }));
    await docs.documents.batchUpdate({ documentId, requestBody: { requests: insertRequests } });
  }

  // One fresh read now that every row that will ever exist is already in place, then fill
  // every real item's cells — last row to first, last cell to first within each row — in a
  // single batch built entirely from this one read.
  const doc = (await docs.documents.get({ documentId })).data;
  const { table } = locateItemTable(doc);
  const fillRequests: docs_v1.Schema$Request[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const row = table.tableRows?.[FIRST_ITEM_ROW_INDEX + i];
    if (!row) continue;
    for (let cellIndex = ITEM_ROW_COLUMN_COUNT - 1; cellIndex >= 0; cellIndex--) {
      const cell = row.tableCells?.[cellIndex];
      const contentStart = cell?.content?.[0]?.startIndex;
      const cellEnd = cell?.endIndex;
      if (contentStart === undefined || contentStart === null || cellEnd === undefined || cellEnd === null) continue;

      // A cell's terminating paragraph mark can't be deleted — stop one short of endIndex.
      if (cellEnd - 1 > contentStart) {
        fillRequests.push({ deleteContentRange: { range: { startIndex: contentStart, endIndex: cellEnd - 1 } } });
      }
      // Docs rejects insertText with an empty string, so a blank value just leaves it empty.
      const value = valueForCell(items[i], i + 1, cellIndex, layout);
      if (value) fillRequests.push({ insertText: { location: { index: contentStart }, text: value } });
    }
  }
  if (fillRequests.length > 0) {
    await docs.documents.batchUpdate({ documentId, requestBody: { requests: fillRequests } });
  }
}

/**
 * Deletes whichever tax rows in the item table (identified by their exact first-cell label
 * text, e.g. "Output IGST Tax Payable") don't apply to this order — an order is always either
 * CGST+SGST (intra-state) or IGST (inter-state), never both, so the unused pair/row would
 * otherwise print as a redundant "0.00" line. Re-locates the table fresh (same reasoning as
 * fillItemTable: Docs character indices shift after every edit) and deletes from the highest
 * row index down, since removing a row only shifts the indices of rows AFTER it — rows still
 * queued for deletion, all at lower indices, stay valid throughout.
 */
async function removeTaxRowsByLabel(docs: docs_v1.Docs, documentId: string, labels: string[]) {
  if (labels.length === 0) return;
  const doc = (await docs.documents.get({ documentId })).data;
  const { tableStartIndex, table } = locateItemTable(doc);
  const rowIndices = (table.tableRows ?? [])
    .map((row, idx) => ({ idx, label: cellText(row.tableCells?.[0] ?? {}).trim() }))
    .filter((r) => labels.includes(r.label))
    .map((r) => r.idx)
    .sort((a, b) => b - a);
  if (rowIndices.length === 0) return;
  const requests: docs_v1.Schema$Request[] = rowIndices.map((rowIndex) => ({
    deleteTableRow: {
      tableCellLocation: { tableStartLocation: { index: tableStartIndex }, rowIndex, columnIndex: 0 },
    },
  }));
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
}

/** Turns a caught error into a short, specific reason a doer (or whoever reads the alert)
 * can actually act on, instead of always blaming the template/env var regardless of what
 * really failed — that generic message once sent someone chasing a non-existent template
 * misconfiguration when the real cause was a transient Google API rate limit. */
function describeGenerationFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/quota exceeded/i.test(message)) {
    const api = /sheets\.googleapis\.com/i.test(message)
      ? "Google Sheets"
      : /drive\.googleapis\.com|docs\.googleapis\.com/i.test(message)
        ? "Google Drive/Docs"
        : "Google API";
    return `${api} API rate limit hit (too many requests this minute) — wait a minute and try again. This isn't a template problem.`;
  }
  if (/permission|forbidden|403/i.test(message) && /drive|docs/i.test(message)) {
    return "The Drive service account can't access the Sale Order template — check it's still shared with it.";
  }
  return message;
}

/**
 * Builds the PDF and returns its Drive fileId, or a short failure reason if it couldn't be
 * generated. Never throws — the caller decides what to do with a failure (the route surfaces
 * the reason as an error rather than silently completing the stage with no attachment).
 */
export async function generateSaleOrderPdf(
  orderId: string,
  fields: SaleOrderDocFields,
  items: SaleOrderDocItem[],
  columnLayout: ColumnLayout = "default",
  // 1 = no padding (T2's existing behaviour, unchanged). T1 passes a larger number so the
  // item section always holds a fixed minimum height, matching the Tally-style reference.
  minRows = 1,
  // Tax rows (by their exact first-cell label) to delete from the item table before
  // filling scalars — see removeTaxRowsByLabel. Empty on T2 (no tax rows to prune).
  removeTaxRowLabels: string[] = []
): Promise<{ fileId: string } | { error: string }> {
  try {
    if (!env.saleOrderTemplateDocId) {
      console.error("generateSaleOrderPdf: SALE_ORDER_TEMPLATE_DOC_ID not configured");
      return { error: "SALE_ORDER_TEMPLATE_DOC_ID is not configured on the server." };
    }

    const drive = await getDriveClientForDocs();
    const docs = await getDocsClient();

    const copied = await drive.files.copy({
      fileId: env.saleOrderTemplateDocId,
      requestBody: { name: `Sale Order - ${fields.saleOrderNo || orderId}`, parents: [env.driveFolderId] },
      fields: "id",
      supportsAllDrives: true,
    });
    const documentId = copied.data.id!;

    try {
      await fillItemTable(docs, documentId, items, columnLayout, minRows);
      await removeTaxRowsByLabel(docs, documentId, removeTaxRowLabels);

      // Exact token text taken from a live dump of the template, not from what was originally
      // written into it — the doer has hand-edited this template since. replaceAllText needs
      // an exact substring match, so a single character off silently leaves the raw <<...>>
      // token visible in the finished PDF.
      const scalars: Record<string, string> = {
        "<<[Sale Order No.]>>": fields.saleOrderNo,
        "<<[Sale Order Date]>>": fields.saleOrderDate,
        "<<[Payment Type]>>": fields.paymentType,
        "<<[Customer Name]>>": fields.customerName,
        "<<[Purchase Order No.]>>": fields.purchaseOrderNo,
        "<<[Sale Order Remarks]>>": fields.saleOrderRemarks,
        "<<[Consignee Name]>>": fields.consigneeName,
        "<<[Preferred Delivery Mode]>>": fields.preferredDeliveryMode,
        "<<[Preferred Transporter Name]>>": fields.preferredTransporterName,
        "<<[Shipping State]>>": fields.shippingState,
        "<<[Round Off]>>": fields.roundOff,
        "<<sum(select(SALE_ORDER_ITEMS[Quantity],[SALE_ORDER_ID]=[_Thisrow].[SALE_ORDER_ID]))>>":
          fields.totalQuantity,
        "<<[Total Amount]>>": fields.totalAmount,
        "<<[Amount In Words]>>": fields.amountInWords,
      };
      if (fields.cgstTotal !== undefined) {
        scalars["<<sum(select(SALE_ORDER_ITEMS[CGST],[SALE_ORDER_ID]=[_Thisrow].[SALE_ORDER_ID]))>>"] =
          fields.cgstTotal;
      }
      if (fields.sgstTotal !== undefined) {
        scalars["<<sum(select(SALE_ORDER_ITEMS[SGST],[SALE_ORDER_ID]=[_Thisrow].[SALE_ORDER_ID]))>>"] =
          fields.sgstTotal;
      }
      if (fields.igstTotal !== undefined) {
        scalars["<<sum(select(SALE_ORDER_ITEMS[IGST],[SALE_ORDER_ID]=[_Thisrow].[SALE_ORDER_ID]))>>"] =
          fields.igstTotal;
      }
      if (fields.branchName !== undefined) {
        scalars["<<[Branch Name]>>"] = fields.branchName;
      }
      const optionalTokens: [keyof SaleOrderDocFields, string][] = [
        ["sellerAddressLine1", "<<[Seller Address Line 1]>>"],
        ["sellerAddressLine2", "<<[Seller Address Line 2]>>"],
        ["sellerState", "<<[Seller State]>>"],
        ["sellerPincode", "<<[Seller Pin code]>>"],
        ["sellerEmail", "<<[Seller Email ID]>>"],
        ["sellerGstin", "<<[Seller GSTIN No.]>>"],
        ["billingAddressLine1", "<<[Billing Address Line 1]>>"],
        ["billingAddressLine2", "<<[Billing Address Line 2]>>"],
        ["billingState", "<<[Billing State]>>"],
        ["buyerGstin", "<<[Buyer GSTIN No.]>>"],
        ["consigneeGstin", "<<[Consignee GSTIN]>>"],
        ["shippingAddressLine1", "<<[Shipping Address Line 1]>>"],
        ["shippingAddressLine2", "<<[Shipping Address Line 2]>>"],
      ];
      for (const [key, token] of optionalTokens) {
        const v = fields[key];
        if (v !== undefined) scalars[token] = v as string;
      }

      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: Object.entries(scalars).map(([find, replace]) => ({
            // replaceText can't be an empty string on some API versions; a single space keeps
            // the request valid and leaves the cell looking blank.
            replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: replace || " " },
          })),
        },
      });

      const pdfExport = await drive.files.export(
        { fileId: documentId, mimeType: "application/pdf" },
        { responseType: "arraybuffer" }
      );
      const pdfBuffer = Buffer.from(pdfExport.data as ArrayBuffer);
      const fileId = await uploadBufferToDrive(
        drive,
        pdfBuffer,
        `Sale Order - ${fields.saleOrderNo || orderId}.pdf`,
        "application/pdf"
      );
      return { fileId };
    } finally {
      await drive.files.delete({ fileId: documentId, supportsAllDrives: true }).catch(() => {});
    }
  } catch (err) {
    console.error("generateSaleOrderPdf failed:", err);
    return { error: describeGenerationFailure(err) };
  }
}
