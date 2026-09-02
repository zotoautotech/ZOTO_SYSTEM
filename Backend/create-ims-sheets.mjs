// One-off script: creates the new IMS spreadsheets (inside the existing Shared Drive
// folder, so the plain service account can own them — see googleAuth.ts's Drive comment)
// and every tab + header row, per docs/work/ims-sheet-header-spec.md.
//
// Headers are matched by NAME in this repo's Backend/src/services/sheets.ts
// (readTable/appendRows key off the header row's text, not column position), so for the
// spec's "PARTIAL"/order-unconfirmed tabs we only need the right header names present —
// exact left-to-right position (which mattered for the old AppSheet reference's
// column-letter-driven forms) is irrelevant to a brand-new sheet built for this app.
//
// Run once: `node create-ims-sheets.mjs` from Backend/. Prints every spreadsheet ID —
// paste them into .env / Vercel env vars per the printed instructions.

import { google } from "googleapis";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const auth = new google.auth.GoogleAuth({
  credentials: key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
});
const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
if (!DRIVE_FOLDER_ID) throw new Error("DRIVE_FOLDER_ID not set in .env");

// ---------------------------------------------------------------------------------------
// Header spec — transcribed from docs/work/ims-sheet-header-spec.md. Every tab listed
// with its full column set. See that file for confidence level (VERIFIED/PARTIAL/PROPOSED)
// and business-rule notes per tab.
// ---------------------------------------------------------------------------------------

const SPREADSHEETS = {
  IMS_SHEET_STOCK_ID: {
    label: "Stock book",
    tabs: {
      "Stock Record FG": ["Timestamp","Useremail","Record ID","Batch ID","Record Details","Type","From","To","Quantity","Unit","Description","Signature","Part Details","Part","Old Part No","Part No","Segment","Category","Sub Category","Standard Part","Attachment","DATE","Year","Month","Month Name"],
      "Stock Record RM": ["Timestamp","Useremail","Record ID","Record Details","Type","From","Entry Type","To","Quantity","Unit","Reason","Reference No.","Reference Attachment","Description","Signature","Vendor Name","Part Details","Part","Batch ID","Old Part Code","Part Code","Part Name","Category","Specification PDF","DATE","Year","Month","Month Name"],
      "Stock Record WIP": ["Timestamp","Useremail","Record ID","Record Details","Type","From","To","Entry Type","Quantity","Unit","WIP Part Weight (in grams)","WIP Part Weigth Image","Description","Signature","Part Details","Part","Batch Code","Old Part Code","Part Code","Category","Sub Category","Paint","Attachment","DATE","Year","Month","Month Name"],
      "Stock Record Other": ["Timestamp","Useremail","Record ID","Record Details","Type","From","Entry Type","To","Quantity","Unit","Reason","Reference No.","Reference Attachment","Description","Signature","Vendor Name","Part Details","Part","Batch ID","Old Part Code","Part Code","Part Name","Category","Specification PDF","DATE","Year","Month","Month Name"],
      "Racks": ["Rack ID","Rack No.","Floor","Unit","Type","Status"],
      "Production FG": ["Timestamp","Useremail","Assemble Id","Qty"],
      "MASTER RM OR OTHER": ["Old Part Code","Part Code","Part Name","Category","Sub Category","Segment","Unit","MIN STOCK","MAX STOCK"],
      "Stock Record FG Adj": ["Timestamp","Useremail","Adjustment ID","Record Details","Entry Type","Type","Quantity","Unit","Description","Signature","Attachment","Part Details","Part","Old Part No","Part No","Segment","Category","Sub Category","DATE","Year","Month","Month Name"],
      "Stock Record RM Adj": ["Timestamp","Useremail","Adjustment ID","Record Details","Entry Type","Type","Quantity","Unit","Description","Signature","Attachment","Part Details","Part","Old Part Code","Part Code","Part Name","Category","DATE","Year","Month","Month Name"],
      "Stock Record WIP Adj": ["Timestamp","Useremail","Adjustment ID","Record Details","Entry Type","Type","Quantity","Unit","Description","Signature","Attachment","Part Details","Part","Old Part Code","Part Code","Category","Sub Category","Paint","DATE","Year","Month","Month Name"],
      "Stock Record Other Adj": ["Timestamp","Useremail","Adjustment ID","Record Details","Entry Type","Type","Quantity","Unit","Description","Signature","Attachment","Part Details","Part","Old Part Code","Part Code","Part Name","Category","DATE","Year","Month","Month Name"],
      "Stock FG Verified": ["Timestamp","Useremail","Veified id","Record Details","Handover Quantity","Unit","Assignee Name","Assigne Sign","Any Other Remark's","Attachement","Part Details","Part","Old Part No","Part No","Segment","Category","Sub Category","DATE","Year","Month","Month Name"],
      "Stock RM Verified": ["Timestamp","Useremail","Veified id","Record Details","Handover Quantity","Unit","Assignee Name","Assigne Sign","Any Other Remark's","Attachement","Part Details","Part","Old Part Code","Part Code","Part Name","Category","DATE","Year","Month","Month Name"],
      "Stock WIP Verified": ["Timestamp","Useremail","Veified id","Record Details","Handover Quantity","Unit","Assignee Name","Assigne Sign","Any Other Remark's","Attachement","Part Details","Part","Old Part Code","Part Code","Category","Sub Category","Paint","DATE","Year","Month","Month Name"],
      "Stock Other Verified": ["Timestamp","Useremail","Veified id","Record Details","Handover Quantity","Unit","Assignee Name","Assigne Sign","Any Other Remark's","Attachement","Part Details","Part","Old Part Code","Part Code","Part Name","Category","DATE","Year","Month","Month Name"],
      "FG Item Allotment": ["Timestamp","Useremail","Out ID","Out Record","Type","From","Quantity","Unit","Purpose","Name","Return Date","Part Details","Part","Old Part No","Part No","Segment","Category","Sub Category","Standard Part","Attachment","DATE","Year","Month","Month Name"],
      "RM Item Allotment": ["Timestamp","Useremail","Out ID","Out Record","Type","From","Quantity","Unit","Purpose","Name","Return Date","Attachment","Part Details","Part","Old Part Code","Part Code","Part Name","Category","DATE","Year","Month","Month Name"],
      "WIP Item Allotment": ["Timestamp","Useremail","Out ID","Out Record","Type","From","Quantity","Unit","Purpose","Name","Return Date","Attachment","Part Details","Part","Old Part Code","Part Code","Category","Sub Category","Paint","DATE","Year","Month","Month Name"],
      "Other Item Allotment": ["Timestamp","Useremail","Out ID","Out Record","Type","From","Quantity","Unit","Purpose","Name","Return Date","Attachment","Part Details","Part","Old Part Code","Part Code","Part Name","Category","DATE","Year","Month","Month Name"],
      "FG Item IN Allotmet": ["Timestamp","Useremail","OUT ID","IN ID","In Record","Type","To","Quantity","Unit","Person Name","Remark","Part Details","Part","Old Part No","Part No","Segment","Category","Sub Category","Standard Part","Attachment","DATE","Year","Month","Month Name"],
      "RM Item IN Allotmet": ["Timestamp","Useremail","OUT ID","IN ID","In Record","Type","To","Quantity","Unit","Person Name","Remark","Attachment","Part Details","Part","Old Part Code","Part Code","Part Name","Category","DATE","Year","Month","Month Name"],
      "Other Item IN Allotmet": ["Timestamp","Useremail","OUT ID","IN ID","In Record","Type","To","Quantity","Unit","Person Name","Remark","Attachment","Part Details","Part","Old Part Code","Part Code","Part Name","Category","DATE","Year","Month","Month Name"],
      "Attachment FG In-Out": ["Timestamp","Useremail","Record ID","Batch ID","Attachment id","Type","Image","File"],
      "Attachment RM In-Out": ["Timestamp","Useremail","Record ID","Batch ID","Attachment id","Type","Image","File"],
      "Attachment WIP In-Out": ["Timestamp","Useremail","Record ID","Batch ID","Attachment id","Type","Image","File"],
      "Attachment Other In-Out": ["Timestamp","Useremail","Record ID","Batch ID","Attachment id","Type","Image","File"],
    },
  },

  IMS_SHEET_RM_WIP_ID: {
    label: "RM/WIP book",
    tabs: {
      "WIP MASTER": ["Timestamp","Useremail","ID'S","PART NO.","Category","Sub Category","Paint","MAKE BY","VENDOR NAME","Old Part Code","Old Part Name","IQC PDF","IQC PDF UPDATE LAST","Machined Or Casted","Year","MIN STOCK","MAX STOCK","Ingot Weight (in grams)","Casted Weight (in grams)","Casted Weight Image","Machined Weight (in grams)","Machined Weight Image"],
      "WIP ATTACHMENT PARTCODE": ["Basic Details","Timestamp","Useremail","Task ID","PART NO."],
      "WIP Image": ["Basic Details","Timestamp","Useremail","Task ID","PART NO.","UNIQUE ID","Log Details","Image","Attachment","Drawing","Video"],
      "ASSEMBLE RM FG": ["Unique id","FG ID","FG CODE","FG CATEGORY","FG SUB CATEGORY","FG PAINT","FG STANDARD","Category","Sub Category","RM ID","RM CODE","DUPLICATE","Serviceable","No. Of Qty Use","Units"],
    },
  },

  IMS_SHEET_PURCHASE_ID: {
    label: "Purchase book",
    tabs: {
      "Vendor Tax Invoices": ["Timestamp","Vendor Tax Invoice ID","Vendor Name","Vendor Details","Purchase Tax Invoice Date","Upload Invoice Details","Advance Amount (%)","Freight Charges Amount","Discount (On invoice)","GST Details","Basic Amount","CGST Amount","SGST Amount","IGST Amount","Total Tax Amount","Total Amount Inc Tax","TDS Amount","Disc Amount","Total Amount After Disc","Payment Details","Deduction Remarks"],
      "Upload Tax Invoice": ["Timestamp","Tax Invoice ID","Vendor Name","Item Details","Material Receiving Details","Rate","Received Qty","Upload Invoice Details","Purchase Tax Invoice Date","Advance Amount (%)","GST Details","CGST %","SGST %","IGST %","Basic Amount","CGST Amount","SGST Amount","IGST Amount","Total Tax Amount","Total Amount Inc Tax","DISC Amount","TDS Amount","Total Amount After Disc"],
      "Store In": ["STR_IN ID","Vendor Name","Timestamp","Sent to IMS","Received Qty","Weight 10 Pcs (In Grams)","Qty Diff","Actual Received Quantity"],
    },
  },

  IMS_SHEET_PRODUCTION_ID: {
    label: "Production book",
    tabs: {
      "Batch Assembly": ["Details","Timestamp","Usermail","Assembly ID","Part Details","Part ID","Old Part Code","Part Code","Part Name","Description","Segment","Category","Sub Category","Paint","Pre Assembly Details","Assembly Quantity","Pre Assembly Notes","Batch Code","Responsible Person","Status","PDF","Requisition Material"],
      "Batch Assembly Followup": ["Details","Timestamp","Usermail","Assembly ID","Assembly Followup ID","Part Details","Part ID","Old Part Code","Part Code","Part Name","Description","Segment","Category","Sub Category","Paint","Pre Assembly Details","Assembly Quantity","Pre Assembly Notes","Batch Code","Responsible Person","Post Assembly Details","Assembly Status","Quantity","Notes","Status"],
      "WIP Stock on Assembly": ["Details","Timestamp","Usermail","Table Name","Related ID","Stock ID","Stock Details","Stock IN","Stock OUT","Type","Quantity","UOM","Description","Signature","Part Details","Part ID","Part","Batch Code","Old Part Code","Part Code","Category","Sub Category","Paint","Made by","Manufacturer Name","Status"],
      "Produced Part": ["Details","Timestamp","Usermail","Production ID","Part Details","Part ID","Old Part Code","Part Code","Part Name","Description","Segment","Category","Sub Category","Paint","Stock","Production Details","Send For","Customer ID","Customer Code","Customer Name","Customer GSTIN","Gate Pass","Quantity","Notes","Status"],
      "Batch Production": ["Timestamp","Usermail","WIP ID","Production Batch ID","WIP Details","FG Code","WIP Code","Category","Sub Category","Paint","Required Quantity","Batch Details","Batch Code","Plan Quantity","Casted Quantity","Part Weight as cast (in grams)","Weighing Part Image","Ingot Weight as Cast (g)","Responsible Person","Start DateTime","Due DateTime","Production Days","Notes","Status","Requistion Materials"],
      "Batch Followup": ["Timestamp","Usermail","Production Batch ID","Followup ID","WIP Details","WIP Code","Category","Sub Category","Paint","Required Quantity","Batch Details","Batch Code","Plan Quantity","Casted Quantity","Part Weight as cast (in grams)","Weighing Part Image","Responsible Person","Start DateTime","Due DateTime","Production Days","Notes","Followup Details","Production Status","Reason","Nest Estimate DateTime","Remarks","Quantity Adjustment","Short or Excess","Short or Excess Reason","Short or Excess Quantity","Balance in Production"],
      "Raw Materials Requisition": ["Timestamp","Requisition ID","Production Batch ID","Assemble RM FG Unique ID","RM Code","Category","Sub Category","Required Quantity","Units","Status"],
      "Assembly RM Requisition": ["Timestamp","Requisition ID","Assembly ID","Assemble RM FG Unique ID","RM Code","Category","Sub Category","Required Quantity","Units","Status"],
      "Stock Release Log": ["Timestamp","Release ID","Requisition Kind","Requisition ID","Requisition IDs","Allocations JSON","RM Code","Old Part Code","Rack","Quantity","Unit","Remark","Record ID","Released By"],
    },
  },

  IMS_SHEET_FG_ID: {
    label: "FG book (Customer KYC intake)",
    tabs: {
      "Customer KYC": ["Timestamp","Customer Name","Company GSTIN NO.","Contact Person Name","Contact No. 1","Reviews Status"],
    },
  },

  IMS_SHEET_MASTER_FG_ID: {
    label: "Master FG Inventory book",
    tabs: {
      "MASTER OF FG INVENTORY": ["TIMESTAMP","USEREMAIL","FG ID","OLD PART NO.","PART NO.","Part Name","Old Part Name","Description","SEGMENT","Category","Sub Category","Standard Part","CUSTOMER NAME","Paint","Status","MACHINING & OTHER COST","Manupulation Partcode","Data Sent To Stock Warehouse","Year","MIN STOCK","MAX STOCK","OPENING STOCK","Discount","price","Final Price","Monthly Stock In","Monthly Stock Out","Adjust FG","Verified FG Stock","Inhouse Stock Issue","Assembled Parts"],
    },
  },

  IMS_SHEET_PRODUCT_MASTER_ID: {
    label: "Product Master book (RM/WIP catalogue)",
    tabs: {
      "Product Master": ["Sr. No.","Part Name","Part Code","Category","Segment","Rate Type","Production Use","ISOMETRIC VIEW","New Part  Codes","Critical Dimension Drawing","Drawing Full Dimension","Real Photo","Part Code Type","Unit","Part Category","Last Rate Date","Last Purchased Rate","Purchase Frequency (Days)","Current Week Rate","Current Rate","Last Purchased Weight","IQC Standard","Model 3D","Test Report","Video 3D","Specifications","Duplicacy By Part Name","Duplicacy By Part Code"],
    },
  },

  IMS_SHEET_DATA_STORAGE_ID: {
    label: "Data Storage book (quarterly snapshots)",
    tabs: {
      "Data Storage FG": ["Storage ID","Timestemp","Storage Details","Old Part No.","Part Code","Quantity","Each Price","Price"],
      "Data Storage RM": ["Storage ID","Timestemp","Storage Details","Old Part No.","Part Code","Quantity","Each Price","Price"],
      "Data Storage WIP": ["Storage ID","Timestemp","Storage Details","Old Part No.","Part Code","Quantity","Each Price","Price"],
      "Data Storage OTH.": ["Storage ID","Timestemp","Storage Details","Old Part No.","Part Code","Quantity","Each Price","Price"],
    },
  },

  IMS_SHEET_CUSTOMER_ID: {
    label: "Customer Master book",
    tabs: {
      "CUSTOMER MASTER V2": ["Timestamp","Useremail","Customer ID","Customer Status","Account Type","Customer Code","Customer Name","Customer Category","Customer Category (%)","Business Segment","Business Type","Marka Code","Website","Logo","Joining Date","Sales Repersentative ID","Sales Repersentative Name","CRM Email ID","CRM ID","CRM Name","KYC Status","Company GSTIN NO.","Company PAN NO.","Name on PAN","Registered Email ID","Registered Contact No.","Firm Type","Credit Status","Payment terms (Days)","Grace Period (Days)","Risk Score","Credit Limit Days","Credit Limit","TDS and TCS Applicable","Trf Status"],
      "Customer Addresses": ["Customer ID","Address Type","Full Address","City","State","Pin Code"],
      "Customer Contacts": ["Customer ID","Contact Person Name","Contact No. 1","Contact Person Designation"],
      "Customer Revisions": ["Customer ID","Grace Period (Days)"],
    },
  },

  IMS_SHEET_MASTER_CUST_ID: {
    label: "Master Customer Data book (post-KYC)",
    tabs: {
      // Only the ~35 columns the reference app ever actually reads/writes are created —
      // this repo's sheets.ts is header-name-driven (not column-letter-driven like the old
      // AppSheet reference), so there is no need to reproduce the reference's 302-column
      // width or exact position; unused/unconfirmed columns simply don't exist here.
      // See docs/work/ims-sheet-header-spec.md item 10 for the full reasoning.
      "MASTER CUSTOMER DATA": ["Timestamp","Field Sale Representative","CUSTOMER NAME","Status Of Customer Manual","Customer Category","Business Segment","TYPE OF CUSTOMER","KYC REQUIRED","KYC STATUS","Company GSTIN NO.","REGISTERED MOBILE NO.","Registered Full Address","Registered City","Registered Country","Registered State","Registered Pin Code","Select addres","Billing Full Address","Billing City","Billing Country","Billing State","Billing Pin Code","Billing PLACE OF SUPPLY","Ship 1 label","Ship 1 GSTIN","Ship 1 PAN","Ship 1 Name","Ship 1 Full Address","Ship 1 City","Ship 1 District","Ship 1 State","Ship 1 Pin Code","Ship 1 Ind Area","Ship 1 Country","Ship 1 State (2)","CONTACT PERSON NAME","MOBILE NO. 1","DESIGNATION","BILLING PAYMENT TERMS EDIT","GRACE DAYS EDIT","CUSTOMER MARKA CODE","Account Type"],
    },
  },
};

// Area 3 (IMS_SHEET_SALE_ID) deliberately excluded — resolved as "reuse the existing
// ZOTO_TRANSACTIONS_SHEET_ID/TRANSPORT_SHEET_ID sheets", no new spreadsheet.

// ---------------------------------------------------------------------------------------

async function createSpreadsheetInSharedDrive(title) {
  const res = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [DRIVE_FOLDER_ID],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return res.data.id;
}

async function addTabsWithHeaders(spreadsheetId, tabs) {
  const tabNames = Object.keys(tabs);
  // Every fresh spreadsheet starts with one default "Sheet1" — add every real tab first,
  // then delete the default once real tabs exist (a spreadsheet can't have zero sheets).
  const addRequests = tabNames.map((name) => ({ addSheet: { properties: { title: name } } }));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: addRequests },
  });

  // Write header rows — one values.update call per tab (values.batchUpdate would also
  // work but per-tab is simpler to reason about / debug if one tab's header is wrong).
  for (const name of tabNames) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${name}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [tabs[name]] },
    });
  }

  // Delete the default "Sheet1" (or whatever Drive named it) now that real tabs exist.
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const defaultSheet = (meta.data.sheets ?? []).find((s) => !tabNames.includes(s.properties.title));
  if (defaultSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ deleteSheet: { sheetId: defaultSheet.properties.sheetId } }] },
    });
  }
}

// ONE read call per spreadsheet (batchGet across every tab's A1:1 row) instead of one
// per tab — the per-tab version above is what tripped the 429 read-quota after ~4
// spreadsheets' worth of individual GETs.
async function verifyHeaders(spreadsheetId, tabs) {
  const ranges = Object.keys(tabs).map((name) => `'${name}'!A1:ZZ1`);
  const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
  const problems = [];
  Object.keys(tabs).forEach((name, i) => {
    const expected = tabs[name];
    const actual = (res.data.valueRanges[i].values?.[0] ?? []).map((h) => String(h ?? "").trim());
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push({ tab: name, expected, actual });
    }
  });
  return problems;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resume support: spreadsheets already created (tabs+headers written) in a prior run —
// skip creation, just verify. Filled in from the first run's console output.
const ALREADY_CREATED = {
  IMS_SHEET_STOCK_ID: "1Jn8Nuv0Qn7S1JQo2N43PdDvMeAtYlJwgdKYlFJsOfY0",
  IMS_SHEET_RM_WIP_ID: "1D-fvsCBHwG6srM19MhF8WOnekxotXbUz2nP5FIAlFPA",
  IMS_SHEET_PURCHASE_ID: "1b9TABh2mqvmLyMia2OSwRMr8Ub5BMiaF9guD9cdbjDM",
  IMS_SHEET_PRODUCTION_ID: "1vAxS1hAmZv5rhqupVrUH5FJDKDlf-LiOVZbw4cefJ_0",
};

async function main() {
  const results = {};
  for (const [envVar, spec] of Object.entries(SPREADSHEETS)) {
    let id = ALREADY_CREATED[envVar];
    if (id) {
      console.log(`\nResuming "${spec.label}" (${envVar}) — already created at ${id}, verifying only...`);
    } else {
      console.log(`\nCreating "${spec.label}" (${envVar})...`);
      id = await createSpreadsheetInSharedDrive(`ZOTO IMS — ${spec.label}`);
      console.log(`  spreadsheet id: ${id}`);
      await sleep(2000);
      await addTabsWithHeaders(id, spec.tabs);
      console.log(`  created ${Object.keys(spec.tabs).length} tabs`);
      await sleep(4000); // let the read-quota window clear before verifying
    }
    const problems = await verifyHeaders(id, spec.tabs);
    if (problems.length > 0) {
      console.error(`  ⚠ header mismatch on ${problems.length} tab(s):`, JSON.stringify(problems, null, 2));
    } else {
      console.log(`  ✓ headers verified by read-back`);
    }
    results[envVar] = id;
    await sleep(4000); // pace between spreadsheets to stay under the per-minute read quota
  }

  console.log("\n\n=== Add these to Backend/.env ===\n");
  for (const [envVar, id] of Object.entries(results)) {
    console.log(`${envVar}=${id}`);
  }
  console.log("\nAlso add the same values to Vercel env vars for Backend before deploying.");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
