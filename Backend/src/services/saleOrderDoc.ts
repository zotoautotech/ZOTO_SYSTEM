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

/** Clears and refills one item row, right-to-left, re-reading the document before each cell —
 * Docs character indices shift after every edit, so a fresh read is what keeps the index math
 * correct across a multi-step fill (same approach as gatePass.ts). */
async function fillRow(
  docs: docs_v1.Docs,
  documentId: string,
  rowIndex: number,
  item: SaleOrderDocItem,
  srNo: number,
  layout: ColumnLayout
) {
  for (let cellIndex = ITEM_ROW_COLUMN_COUNT - 1; cellIndex >= 0; cellIndex--) {
    const doc = (await docs.documents.get({ documentId })).data;
    const { table } = locateItemTable(doc);
    const cell = table.tableRows?.[rowIndex]?.tableCells?.[cellIndex];
    const contentStart = cell?.content?.[0]?.startIndex;
    const cellEnd = cell?.endIndex;
    if (contentStart === undefined || contentStart === null || cellEnd === undefined || cellEnd === null) continue;

    const requests: docs_v1.Schema$Request[] = [];
    // A cell's terminating paragraph mark can't be deleted — stop one short of endIndex.
    if (cellEnd - 1 > contentStart) {
      requests.push({ deleteContentRange: { range: { startIndex: contentStart, endIndex: cellEnd - 1 } } });
    }
    // Docs rejects insertText with an empty string, so a blank value just leaves the cell empty.
    const value = valueForCell(item, srNo, cellIndex, layout);
    if (value) requests.push({ insertText: { location: { index: contentStart }, text: value } });
    if (requests.length === 0) continue;
    await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  }
}

async function fillItemTable(
  docs: docs_v1.Docs,
  documentId: string,
  items: SaleOrderDocItem[],
  layout: ColumnLayout
) {
  if (items.length === 0) return;

  await fillRow(docs, documentId, FIRST_ITEM_ROW_INDEX, items[0], 1, layout);

  let lastRowIndex = FIRST_ITEM_ROW_INDEX;
  for (let i = 1; i < items.length; i++) {
    const doc = (await docs.documents.get({ documentId })).data;
    const { tableStartIndex } = locateItemTable(doc);
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertTableRow: {
              tableCellLocation: {
                tableStartLocation: { index: tableStartIndex },
                rowIndex: lastRowIndex,
                columnIndex: 0,
              },
              insertBelow: true,
            },
          },
        ],
      },
    });
    lastRowIndex += 1;
    await fillRow(docs, documentId, lastRowIndex, items[i], i + 1, layout);
  }
}

/**
 * Builds the PDF and returns its Drive fileId, or null if it couldn't be generated. Never
 * throws — the caller decides what to do with a null (the route surfaces it as an error
 * rather than silently completing the stage with no attachment).
 */
export async function generateSaleOrderPdf(
  orderId: string,
  fields: SaleOrderDocFields,
  items: SaleOrderDocItem[],
  columnLayout: ColumnLayout = "default"
): Promise<string | null> {
  try {
    if (!env.saleOrderTemplateDocId) {
      console.error("generateSaleOrderPdf: SALE_ORDER_TEMPLATE_DOC_ID not configured");
      return null;
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
      await fillItemTable(docs, documentId, items, columnLayout);

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
      return await uploadBufferToDrive(
        drive,
        pdfBuffer,
        `Sale Order - ${fields.saleOrderNo || orderId}.pdf`,
        "application/pdf"
      );
    } finally {
      await drive.files.delete({ fileId: documentId, supportsAllDrives: true }).catch(() => {});
    }
  } catch (err) {
    console.error("generateSaleOrderPdf failed:", err);
    return null;
  }
}
