# 01 — Product Requirements Document (PRD)

**Project:** ZOTO SYSTEM — Sales CRR (Customer Requirement Register)
**Version:** 1.0 (Draft)
**Date:** 17 July 2026
**Owner:** Operations — The Airtrap (operations@theairtrap.com)
**Status:** 🟡 Draft — pending review

---

## 1. Problem Statement

The sales team currently runs its end-to-end **order-to-delivery process** on a no-code app ("SALES CRR-ADC-V5"). The business needs a custom-built system it fully owns and controls, with:

- A **web app** (React.js) for the operations team
- A **mobile app** (React Native, later phase) for field/dispatch staff
- **Google Sheets as the database**, so the team keeps its familiar spreadsheet workflows, reporting, and easy manual corrections
- Deployment on **Vercel**, source on **GitHub**

Today's pain points the custom system must solve:

1. Order status is spread across stages with no single owned view of "where is this order right now?"
2. No-code platform limits: customization, cost per user, data ownership, offline behaviour.
3. Every stage (punch → delivery) needs a clear pending/completed queue per user role.

## 2. Goals

| # | Goal | Measure of success |
|---|------|--------------------|
| G1 | Digitize the full order lifecycle: Punch → Delivery | Every order traceable end-to-end by Order ID |
| G2 | Stage-wise pending queues | Each module shows Pending / Completed lists like current app |
| G3 | Google Sheets as single source of truth | All reads/writes go through the API to the master spreadsheet |
| G4 | Match existing UI so retraining is zero | Team can use the new app without training |
| G5 | Masters managed centrally | Customer, Transport, Finished Goods, Billing Strategy masters drive all dropdowns |

## 3. Non-Goals (v1)

- ❌ Payment collection / receivables tracking (only Payment Type & Advance % captured)
- ❌ Full inventory management (only Stock Release step is modeled)
- ❌ Direct Tally software integration (only the **Tally 1 Registered / Tally 2 Unregistered** book flag is recorded)
- ❌ Customer-facing portal
- ❌ Offline-first mobile sync (phase 2 evaluation)

## 4. Users & Roles

> DRAFT — to confirm: exact role names and permissions with the user.

| Role | Primary modules | Description |
|------|-----------------|-------------|
| **Sales Ops** | Punch Order, Sale Order, Remarks, Sample | Enters incoming purchase orders, creates sale orders |
| **Sales Manager** | SO Confirmation, Dispatch Approval | Approves/confirms orders, authorizes dispatch |
| **Quality / Plant** | PDI, Stock Release | Pre-Dispatch Inspection, releases stock |
| **Logistics** | Transport, Transport Reached, Dispatch, Collect LR, Delivery | Arranges vehicles, tracks movement, collects Lorry Receipt, confirms delivery |
| **Accounts** | Tax Invoice | Raises GST tax invoice, selects Tally book |
| **Admin** | All + Masters | Manages master sheets and users |

## 5. The Order Lifecycle (core of the product)

Every order moves through a fixed pipeline. Each stage is a module with its own **Pending** queue (records waiting for action) and **Completed** list. Completing a stage pushes the order into the next stage's pending queue.

```
Punch Order → Sale Order → SO Confirmation → Dispatch Approval → PDI
    → Transport → Transport Reached → Stock Release → Tax Invoice
    → Dispatch → Collect LR → Delivery ✓
```

Cross-cutting modules (not in the pipeline):
- **Remarks** — stage-agnostic notes/issues attached to an order
- **Sample** — sample requests/dispatches tracked separately

### 5.1 Stage definitions

> Stages 1–2 are confirmed from screenshots. Stages 3–12 are **DRAFT — to confirm** (fields inferred from module names and standard Indian GST order-to-dispatch practice).

| # | Stage / Module | Actor | What happens | Key data captured |
|---|----------------|-------|--------------|-------------------|
| 1 | **Punch Order** ✅ confirmed | Sales Ops | Customer's purchase order is entered via 4-tab form | PO No., PO Date, PO attachment (PDF), remarks; Order Type (Incoming/Outgoing); Payment Type (Credit/Advance + Advance %); Tally book (Tally 1 Registered / Tally 2 Unregistered); CUST ID; Client Classification (Existing/New/Prospective); Billing Address; Logistics Details; Buyer GSTIN |
| 2 | **Sale Order** | Sales Ops | Internal Sale Order created against the punched PO with product line items | SO No., SO Date, line items (FG code, qty, rate, UoM, GST %), billing strategy |
| 3 | **SO Confirmation** | Sales Manager | Sale Order reviewed & confirmed/rejected | Confirmation status, confirmed by, remarks |
| 4 | **Dispatch Approval** | Sales Manager | Approval to proceed to dispatch (credit check etc.) | Approval status, approved by, credit remarks |
| 5 | **PDI** (Pre-Dispatch Inspection) | Quality | Goods inspected before dispatch | Inspection result (Pass/Fail), report attachment, inspector |
| 6 | **Transport** | Logistics | Vehicle/transporter arranged | Transporter (from master), vehicle no., driver name & phone, freight, expected date |
| 7 | **Transport Reached** | Logistics | Vehicle arrival at plant/warehouse confirmed | Reached timestamp, vehicle check remarks |
| 8 | **Stock Release** | Plant | Stock released for loading | Released qty per line, released by |
| 9 | **Tax Invoice** | Accounts | GST invoice raised | Invoice No., invoice date, taxable value, GST breakup, invoice PDF, Tally book |
| 10 | **Dispatch** | Logistics | Goods loaded and dispatched | Dispatch timestamp, e-way bill no., loaded qty |
| 11 | **Collect LR** | Logistics | Lorry Receipt collected from transporter | LR No., LR date, LR copy attachment |
| 12 | **Delivery** | Logistics | Delivery confirmed at customer end | Delivered date, POD (proof of delivery) attachment, receiver name |

### 5.2 Order status model

One order carries a single `CURRENT_STAGE` plus per-stage status:

- `PENDING` — waiting in this stage's queue
- `COMPLETED` — stage done, moved forward
- `REJECTED` / `FAILED` — stage-specific (SO Confirmation reject, PDI fail) → order flagged, returns to a previous stage or is closed (> DRAFT — to confirm rejection routing)
- `CANCELLED` — order closed at any point by authorized role

## 6. Masters (Google Sheets)

All dropdowns and reference data come from 4 master sheets maintained by Admin (user will share actual sheet with headers; drafted in [05-BACKEND-SCHEMA.md](05-BACKEND-SCHEMA.md)):

1. **Customer Master** — CUST ID, name, GSTIN, classification, addresses, contacts, credit terms
2. **Transport Master** — transporter ID, name, contact, GSTIN, routes/rates
3. **Finished Goods Master** — FG code, description, UoM, HSN code, GST %, pack size
4. **Billing Strategy Master** — strategy code, billing entity/series rules (e.g., which Tally book, invoice series)

## 7. Functional Requirements

### 7.1 Every list module (all 14)
- FR-1: Pending queue by default; **Completed** toggle to switch view (as in current app)
- FR-2: Left filter panel grouping records by Customer Name with counts; "All" option
- FR-3: Column layout matching current app (Status, Timestamp, Tally, Order Type, Payment Type, Customer Name, Buyer GSTIN No., …) with horizontal scroll
- FR-4: Global search within module; `+` button opens the create form (where applicable)
- FR-5: Row click opens detail / stage-completion form

### 7.2 Order Punch form (confirmed from screenshots)
- FR-6: 4-tab slide-over stepper: **Purchase Order Details → Order Details → Billing Address → Logistics Details** with Prev / Cancel / Next, red active-tab underline
- FR-7: Tab 1 fields: Purchase Order No. (required), Purchase Order Date (date picker), Purchase Order Attachment (PDF upload), Purchase Order Remarks, Other Order Attachment (PDF upload)
- FR-8: Tab 2 fields: Order Type toggle (Order Incoming / Order Outgoing), Payment Type toggle (Credit / Advance); if Advance → Advance Payment (%) numeric 0–100 with inline validation ("This entry is invalid" for out-of-range); Buyer Details → CUST ID searchable dropdown from Customer Master; Client Classification toggle (Existing / New / Prospective)
- FR-9: Tabs 3–4 (Billing Address, Logistics Details): > DRAFT — fields to confirm from later screenshots; assumed: billing address auto-filled from Customer Master with override, delivery address, preferred transport, delivery instructions
- FR-10: Tally book selection (Tally 1 Registered / Tally 2 Unregistered) — visible in list; > DRAFT — confirm which tab holds this field

### 7.3 Pipeline behaviour
- FR-11: Completing stage N creates/activates the record in stage N+1's pending queue with data carried forward
- FR-12: An order's full timeline (all stages with timestamps and actors) is visible from any stage's detail view
- FR-13: Attachments (PO, PDI report, invoice, LR, POD) uploaded to Google Drive; links stored in sheets

### 7.4 System
- FR-14: Sync indicator in the top bar ("Sync complete" as in current app) reflecting last successful Sheets read/write; manual refresh button
- FR-15: Login with email; role decides visible modules (> DRAFT — confirm auth preference)
- FR-16: All writes stamped with user email + timestamp (audit columns)

## 8. Success Metrics

- 100% of new orders entered through the system (no side-channel WhatsApp/Excel orders)
- Order stage lookup time < 10 seconds (vs. asking around)
- Zero retraining: team self-onboards due to identical UI

## 9. Open Questions (for the user)

1. Rejection routing: when SO Confirmation is rejected or PDI fails, does the order go back to a specific stage or get closed?
2. Fields for Billing Address & Logistics Details tabs (screenshots pending).
3. Exact role list and who can see/complete which stage.
4. Sample and Remarks module workflows (screenshots pending).
5. Actual Google Sheet headers (link pending — will reconcile [05-BACKEND-SCHEMA.md](05-BACKEND-SCHEMA.md)).
