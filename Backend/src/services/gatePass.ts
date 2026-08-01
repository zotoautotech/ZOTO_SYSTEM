import type { docs_v1 } from "googleapis";
import { env } from "../config/env.js";
import { getDocsClient, getDriveClientForDocs } from "./googleAuth.js";
import { uploadBufferToDrive } from "./drive.js";
import { readTable, updateRow } from "./sheets.js";
import { punchFromSheet } from "../routes/orderPunchMap.js";

// Fixed shape of the "Sales-CRR Gate Pass Template" Google Doc's item table — SR. NO. /
// PART NO. / PART NAME / QUANTITY / UNIT / NO. OF BOX. The header row (row 0) is used as a
// stable anchor to re-locate this exact table on every fresh read (see locateItemTable) —
// far more robust than tracking raw character indices across edits, which shift after every
// insertText/insertTableRow.
const ITEM_TABLE_HEADER_ANCHOR = "SR. NO.";
const ITEM_ROW_COLUMN_COUNT = 6;
const FIRST_ITEM_ROW_INDEX = 1; // row 0 is the header row

interface GatePassItem {
  partNo: string;
  partName: string;
  loadQty: string;
  unit: string;
  loadBoxes: string;
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

/** Finds the item table by its permanent header-row text (never edited, unlike the
 * placeholder/data rows below it) — safe to call again after every edit, since it never
 * relies on indices that could have shifted. Returns the table's own position in
 * doc.body.content (needed for insertTableRow's tableStartLocation) plus the table object
 * itself (for reading current row/cell indices). */
function locateItemTable(doc: docs_v1.Schema$Document): { tableStartIndex: number; table: docs_v1.Schema$Table } {
  for (const el of doc.body?.content ?? []) {
    if (!el.table || el.startIndex === undefined || el.startIndex === null) continue;
    const headerRow = el.table.tableRows?.[0];
    const headerText = (headerRow?.tableCells ?? []).map(cellText).join(" ");
    if (headerText.includes(ITEM_TABLE_HEADER_ANCHOR)) {
      return { tableStartIndex: el.startIndex, table: el.table };
    }
  }
  throw new Error(`Gate pass template: item table not found (looking for header "${ITEM_TABLE_HEADER_ANCHOR}")`);
}

function valueForCell(item: GatePassItem, srNo: number, cellIndex: number): string {
  switch (cellIndex) {
    case 0: return String(srNo);
    case 1: return item.partNo;
    case 2: return item.partName;
    case 3: return item.loadQty;
    case 4: return item.unit;
    case 5: return item.loadBoxes;
    default: return "";
  }
}

/** Clears (if non-empty) and fills every cell of one table row with this item's values.
 * Refetches the document fresh before touching each cell — the only way to keep index math
 * correct once earlier cells/rows have already been edited in this same pass. */
async function fillRow(docs: docs_v1.Docs, documentId: string, rowIndex: number, item: GatePassItem, srNo: number) {
  for (let cellIndex = ITEM_ROW_COLUMN_COUNT - 1; cellIndex >= 0; cellIndex--) {
    const doc = (await docs.documents.get({ documentId })).data;
    const { table } = locateItemTable(doc);
    const cell = table.tableRows![rowIndex].tableCells![cellIndex];
    const contentStart = cell.content?.[0]?.startIndex;
    const cellEnd = cell.endIndex;
    if (contentStart === undefined || contentStart === null || cellEnd === undefined || cellEnd === null) continue;

    const requests: docs_v1.Schema$Request[] = [];
    // A cell's own terminating paragraph mark can't be deleted — stop one short of endIndex.
    if (cellEnd - 1 > contentStart) {
      requests.push({ deleteContentRange: { range: { startIndex: contentStart, endIndex: cellEnd - 1 } } });
    }
    requests.push({ insertText: { location: { index: contentStart }, text: valueForCell(item, srNo, cellIndex) } });
    await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  }
}

async function fillItemTable(docs: docs_v1.Docs, documentId: string, items: GatePassItem[]) {
  if (items.length === 0) return;

  await fillRow(docs, documentId, FIRST_ITEM_ROW_INDEX, items[0], 1);

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
              tableCellLocation: { tableStartLocation: { index: tableStartIndex }, rowIndex: lastRowIndex, columnIndex: 0 },
              insertBelow: true,
            },
          },
        ],
      },
    });
    lastRowIndex += 1;
    await fillRow(docs, documentId, lastRowIndex, items[i], i + 1);
  }
}

function sumNumeric(items: GatePassItem[], field: "loadQty" | "loadBoxes"): string {
  const total = items.reduce((acc, it) => acc + (Number(it[field]) || 0), 0);
  return String(total);
}

/**
 * Generates (or returns the already-generated) Dispatch Gate Pass PDF for a trip — one per
 * trip, combining every attached order's items into a single document (the doer's own call:
 * the template only has room for one Bill To/Ship To, so the first attached order's
 * buyer/billing/shipping snapshot is used for those fields). No-ops if a value already
 * exists on any Transport_SO row for this trip, or if the trip has no attached orders yet.
 * Never throws — every failure is logged and turned into `null`, so callers can always just
 * `await` this. Called both right after attachOrders (the "instant on Save" trigger) and
 * defensively from GET /transport-trips/:id (self-healing retry for the rare failure case).
 */
export async function ensureDispatchGatePass(transportId: string): Promise<string | null> {
  try {
    const [transportRows, soRows, productRows, punchRows] = await Promise.all([
      readTable(env.sheets.transactions, "TRANSPORT"),
      readTable(env.sheets.transactions, "Transport_SO"),
      readTable(env.sheets.transactions, "Transport_Products"),
      readTable(env.sheets.transactions, "ORDER_PUNCH"),
    ]);
    const transport = transportRows.find((r) => r.Transport_ID === transportId);
    const attachedSoRows = soRows.filter((r) => r.Transport_ID === transportId);
    if (!transport || attachedSoRows.length === 0) return null;

    const existing = attachedSoRows.find((r) => r["Dispatch Gate Pass"])?.["Dispatch Gate Pass"];
    if (existing) return existing;

    if (!env.dispatchGatePassTemplateDocId) {
      console.error("ensureDispatchGatePass: DISPATCH_GATE_PASS_TEMPLATE_DOC_ID not configured, skipping");
      return null;
    }

    const firstOrderId = attachedSoRows[0].ORDER_ID;
    const firstPunch = punchRows.find((r) => r.ORDER_ID === firstOrderId);
    if (!firstPunch) return null;
    const order = punchFromSheet(firstPunch);

    const items: GatePassItem[] = productRows
      .filter((r) => r.Transport_ID === transportId)
      .map((r) => ({
        partNo: r["Part No."] || "",
        partName: r["Part Name"] || "",
        loadQty: r["Load Qty"] || "",
        unit: r["Unit"] || "",
        loadBoxes: r["Load Boxes"] || "",
      }));
    if (items.length === 0) return null;

    // Both clients impersonate the same Workspace user but via the documents-scoped JWT
    // client (see getDriveClientForDocs()'s own comment in googleAuth.ts) — kept separate
    // from the plain getDriveClient() used by the attachment-upload feature so this new,
    // not-yet-domain-wide-delegation-authorized scope can't break that existing feature.
    const drive = await getDriveClientForDocs();
    const docs = await getDocsClient();

    const copied = await drive.files.copy({
      fileId: env.dispatchGatePassTemplateDocId,
      requestBody: { name: `Gate Pass - ${transportId}`, parents: [env.driveFolderId] },
      fields: "id",
      supportsAllDrives: true,
    });
    const documentId = copied.data.id!;

    try {
      await fillItemTable(docs, documentId, items);

      const scalarReplacements: Record<string, string> = {
        "<<now()>>": new Date().toLocaleDateString("en-IN"),
        "<<[Transport ID]>>": transportId,
        "<<[Transport ID].[Customer Name]>>": order.CUSTOMER_NAME ?? "",
        "<<[Transport ID].[Billing Address Line 1]>>": order.BILLING_ADDRESS ?? "",
        "<<[Transport ID].[Shipping Address Line 1]>>": order.SHIPPING_ADDRESS ?? "",
        "<<[Transport ID].[Transporter ID]>>": transport["Transporter ID"] ?? "",
        "<<[Transport ID].[Transporter Name]>>": transport["Transporter Name"] ?? "",
        "<<[Transport ID].[Vehicle type]>>": transport["Vehicle type"] ?? "",
        "<<[Transport ID].[Vehicle No.]>>": transport["Vehicle No."] ?? "",
        "<<[Transport ID].[Vehicle Size (Ft)]>>": transport["Vehicle Size (Ft)"] ?? "",
        "<<[Transport ID].[Driver Contact No.]>>": transport["Driver Contact No."] ?? "",
        "<<sum(select[Transport Items[Load Qty],[Transport ID]=[_Thisrow].[Transport ID]])>>": sumNumeric(items, "loadQty"),
        "<<sum(select[Transport Items[Load Boxes],[Transport ID]=[_Thisrow].[Transport ID]])>>": sumNumeric(items, "loadBoxes"),
      };
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: Object.entries(scalarReplacements).map(([find, replace]) => ({
            replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: replace },
          })),
        },
      });

      const pdfExport = await drive.files.export(
        { fileId: documentId, mimeType: "application/pdf" },
        { responseType: "arraybuffer" }
      );
      const pdfBuffer = Buffer.from(pdfExport.data as ArrayBuffer);
      const pdfFileId = await uploadBufferToDrive(drive, pdfBuffer, `Gate Pass - ${transportId}.pdf`, "application/pdf");

      for (const so of attachedSoRows) {
        await updateRow(env.sheets.transactions, "Transport_SO", "Transport_SO_ID", so.Transport_SO_ID, {
          "Dispatch Gate Pass": pdfFileId,
        });
      }

      return pdfFileId;
    } finally {
      await drive.files.delete({ fileId: documentId, supportsAllDrives: true }).catch(() => {});
    }
  } catch (err) {
    console.error("ensureDispatchGatePass failed:", err);
    return null;
  }
}
