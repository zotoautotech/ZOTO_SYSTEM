# 07 — Google Sheet Redesign Plan (Reference → ZOTO)

**Version:** 1.1
**Date:** 17 July 2026
**Reference sheet analyzed:** `SALES CRR` ADC production sheet (50 tabs, ~1,400 orders, ~20,000 dispatch rows)
**Decisions locked (17 Jul):** ✅ Tally 1 (Registered) ONLY — a separate Tally-2 system will be built later with the same flow · ✅ PRODUCTION tab included · ✅ Masters live in 3 separate user-maintained spreadsheets (below) · KYC etc. stays in the customer master sheet, not in transactions.

## The four-spreadsheet architecture

| Spreadsheet | Role | ID |
|-------------|------|----|
| **ZOTO TRANSACTIONS** (blank, edit access) | All pipeline tabs — **I create these** | `165xJOwRbXlWm7lzg23O0yP85618UIKVimF-p_AVbkd0` |
| Customer + Billing Strategy Master | User-maintained | `1YQsQki4GBtyuWXJewmGkGk-fX_Yimb_dyI4ydwuPcag` |
| Transport Master | User-maintained (41 transporters seeded) | `1B7QuXzAI7FcucAdJhaZigmxJ5HQs77anmOO_EZ_XsjM` |
| FG Inventory Master | User-maintained (28 parts seeded) | `1Pbsp8ZSpHKrrTTZi0a_ZJsmaevNSsvXYnzosfDVM2aA` |

The reference works the same way — its broken `Customer Data` tab was an IMPORTRANGE from a master sheet. In ZOTO, the **API reads masters directly from their spreadsheets** (no IMPORTRANGE needed), and snapshots the needed values into transaction rows at write time.

---

## PART A — How the reference system works (data flow by unique ID)

### A.1 The golden thread: `Previous ID` (PRE-xxxx)

Every order starts in **Order Punch Initial** with a `Previous ID` like `PRE-7d4dfcb5`. This single ID is carried into **almost every downstream tab** — it ties one customer order across the entire lifecycle. Each stage adds its own stage ID (random 8-hex suffix, AppSheet `UNIQUEID()`).

### A.2 Three parallel tracks

**Track 1 — Order track (header level):**
```
PRE-… (Order Punch Initial) → PNCH-… (Order Punch, + REV-… revision)
  → SALE-… (Sale Order, No. like ADC/SO/25-26/0171) → CONF-… (SO Confirmation: payment check)
```

**Track 2 — Item track (each line item moves independently):**
```
PRE-ITM-… → PNCH-ITM-… → SALE-ITM-… → CONF-ITM-…      (priced copies at each stage)
  → PRE-PD-CONF-… (FG stock booking) → DISP-CONF-ITM-… (Dispatch Items Approval:
    planned/actual/short/excess/balance qty) → PD-CONF-ITM… (Production Confirmation:
    available stock vs to-be-produced) → PDCN-ITM-… (Production progress, stage e.g. Casting)
  → PDI-ITM-… (inspection, sample size, box qty) → PRE-TPT-… (packing: boxes, NUG)
```
Plus dispatch-schedule sub-track (`PRE-DISP-…` → `PNCH-DIS-…` → `CONF-DIS-…`): expected date + qty per item → partial dispatches.

**Track 3 — Vehicle track (one vehicle trip carries MULTIPLE orders):**
```
TPT-… (vehicle trip)
  ├─ TPT-SO-… (Transport_SO: one row per order on the vehicle)
  ├─ TPT-PD-… (Transport_Products: per item loaded, Load Qty vs Balance)
  → TPT-RCH-… (Reached) → Stock_Pd_ID (Stock Release) → INVC-… (+ INVC-SO-, INVC-PD- lines)
  → PRE-DISP-… (Pre Dispatch: invoice+e-way ready) → VHCL-DISP-… → DISP-… (gate pass, freight)
  → LR-… → DLRY-… (Delivery, receiving attachment)
```

**Cross-cutting:** `RMK-…` (All Remarks Log: Step + Step ID), `LEDG-…`/`TPT-PMT-…` (transporter freight accounting — deferred to v2). **Config tabs:** UI, Permissions, Email & Work, CRR DD (dropdowns).

### A.3 Mechanics preserved in the redesign

1. **Item-level independence** — approval, production, PDI, packing, loading per line; partial dispatches with Short/Excess/Balance tracking.
2. **Vehicle-centric logistics** — invoice/dispatch/LR/delivery hang off the vehicle trip; `Transport_SO` junction links trips ↔ orders.
3. **Quantity conservation** — every movement writes `Balance / This-Step Qty / New Balance`.
4. **Snapshot-on-write** — buyer/logistics values frozen into stage rows (but only the ~15 columns that matter, not 80).
5. **Billing-strategy pricing** — reference items carry `Billing T1 (%)`, `Price T1/T2`, `Discount T1/T2`; ZOTO's BILLING STRATEGY MASTER (rate contract per customer+part with time-based specials) formalizes this. **This system uses only the T1 side.**

### A.4 Problems in the reference design (what the redesign fixes)

| # | Problem | Fix |
|---|---------|-----|
| P1 | 80–100 columns denormalized into 15+ tabs | Normalize; API joins; snapshot only invoice-critical fields |
| P2 | Random hex IDs (`PNCH-0fa1569d`) | Readable sequential IDs (`ORD-2526-0001`) |
| P3 | Junk tabs (Copy of…, Sheet60, #REF! imports) | Clean 20-tab transaction sheet |
| P4 | `PRE-DISP-` prefix means two different things | Unique prefix per entity |
| P5 | Item data re-copied at every stage (2,700+ rows × 4) | ONE `ORDER_ITEMS` row per item for life; stages reference `ITEM_ID` |
| P6 | Free-text statuses (`OK`, `AB`, `proceed..`) | Strict enums + data validation |
| P7 | Tally 1/2 mixed in one system (split punches, zeroed GST) | **This system = Tally 1 only**; Tally 2 gets its own system later |

---

## PART B — The ZOTO redesign

### B.1 Master sheets (user-maintained — read by the API, I do NOT restructure them)

| Master | Tab(s) used | Key columns the transactions reference |
|--------|-------------|----------------------------------------|
| **Customer** | `CUSTOMER MASTER V2` (operative; legacy T1 tab ignored) + `Customer Addresses` + `Customer Contacts` (+ `Customer Revisions`, `Master Form_Apps_etc` dropdowns) | Customer Code (`CUST-0001`), Customer Name, GSTIN, PAN, Payment/Grace days, Credit Status/Limit, Marka Code; Address ID (typed: Billing/Ship-to) ; Contact ID (person, phone, responsibility) |
| **Billing Strategy** | `BILLING STRATEGY MASTER` (same spreadsheet as customer) | Strategy ID, CUST ID, Part (Code/Name), **Default Rate T1, Default Billing T1 (%), Default Discount T1 (Rs/%), time-based Special Rate/Billing/Discount T1 + validity windows, Note (e.g. "Without Box")** → auto-prices items at Order Punch |
| **Transport** | `Transporter Data` | Transporter ID (`TPT-0001`), Type (Local/Registered), Name, GSTIN/PAN, contacts, Available Vehicle type/size |
| **FG Inventory** | `MASTER OF FG INVENTORY` | FG ID, PART NO., SEGMENT, CATEGORY, Name, MIN/MAX/OPENING STOCK, UNIT, price/Final Price |

> ⚠ Note for the user: `BILLING STRATEGY MASTER` rows currently have empty `Strategy ID` and Part Code — the API will need Strategy ID filled (or it will key on CUST ID + Part Name). `MASTER OF FG INVENTORY` rows have empty PART NO./SEGMENT/CATEGORY — fill before go-live.

### B.2 Design rules

1. Every entity lives in ONE tab; stages reference IDs; the Node.js API composes joins.
2. Sequential fiscal-year IDs issued by the API from a `COUNTERS` tab.
3. One `ORDER_ITEMS` row per item for life; stage progress in stage tabs keyed by `ITEM_ID`.
4. Strict enums + audit columns everywhere: `STATUS, CREATED_AT, CREATED_BY, UPDATED_AT, UPDATED_BY, ROW_VERSION`.
5. Tally fixed to `Tally 1 (Registered)` — no Tally column needed except on TAX_INVOICES for Tally-export clarity.

### B.3 ID scheme

| Prefix | Entity | Example |
|--------|--------|---------|
| `ORD-` | Order (golden thread) | `ORD-2627-0001` |
| `ITM-` | Order line item | `ITM-2627-0001-01` |
| `DSP-` | Dispatch plan line | `DSP-2627-0001-01-1` |
| `SO-` | Sale Order No. | `ZOTO/SO/26-27/0001` |
| `DAP- / PRD- / PDI- / PCK-` | Approval / Production / PDI / Packing (per item) | `DAP-2627-0001-01` |
| `TRP- / STK- / INV- / DDL-` | Trip / Stock release / Invoice / Dispatch-delivery leg | `TRP-2627-0001` |
| `RMK- / SMP-` | Remark / Sample | |
| Masters keep their own: `CUST-####`, `TPT-####`, FG ID | | |

### B.4 ZOTO TRANSACTIONS sheet — 20 tabs

#### Order track (4)
| Tab | Headers (+ audit columns on all) |
|-----|----------------------------------|
| `ORDERS` | ORDER_ID, PO_NO, PO_DATE, PO_ATTACHMENT_URL, OTHER_ATTACHMENT_URL, PO_REMARKS, ORDER_TYPE (Incoming/Outgoing), SALE_TYPE (Regular/Sample), PAYMENT_TYPE (Credit/Advance), ADVANCE_PCT, CUST_ID, CUSTOMER_NAME*, BUYER_GSTIN*, CLIENT_CLASSIFICATION*, THIS_ORDER_PAYMENT_TERMS, CONTACT_PERSON*, CONTACT_NO*, ORDER_GIVEN_BY, SALE_STAFF_NAME, SHIP_TO_CONSIGNEE (Y/N), BILLING_ADDRESS_ID, BILLING_ADDRESS*, BILLING_STATE*, BILLING_PINCODE*, SHIPPING_SAME (Y/N), SHIPPING_ADDRESS_ID, SHIPPING_ADDRESS*, SHIPPING_STATE*, SHIPPING_PINCODE*, CONSIGNEE_NAME, CONSIGNEE_GSTIN, CONSIGNEE_CONTACT, PREFERRED_DELIVERY_MODE, PREFERRED_TRANSPORT_MODE, FREIGHT_PAID_BY, FREIGHT_ON_INVOICE (Y/N), PREFERRED_TPT_ID, BASIC_AMOUNT, TAX_AMOUNT, TOTAL_AMOUNT, CURRENT_STAGE, APPROVAL_STATUS, APPROVAL_REMARKS — *(*= snapshot from master at punch)* |
| `ORDER_ITEMS` | ITEM_ID, ORDER_ID, FG_ID, PART_NO*, PART_NAME*, SEGMENT*, CATEGORY*, STRATEGY_ID (← Billing Strategy used), PRICE, QTY, UOM, DISCOUNT_ON (Rs/%), DISCOUNT_RS, DISCOUNT_PCT, BASIC_AMOUNT, GST_SLAB_PCT, CGST, SGST, IGST, TAX_AMOUNT, TOTAL_AMOUNT, SPECIAL_INSTRUCTIONS, PACKING_REQUIREMENTS, NOTES |
| `DISPATCH_PLAN` | DSP_ID, ITEM_ID, ORDER_ID, EXPECTED_DATE, PLANNED_QTY, UOM |
| `SALE_ORDERS` | SO_ID, ORDER_ID, SO_NO, SO_DATE, SO_ATTACHMENT_URL, SO_REMARKS, CONFIRMATION (Confirmed/Rejected), RECEIVED_PAYMENT_AMOUNT, PAYMENT_PCT, PAYMENT_ATTACHMENT_URL, CONFIRMATION_REMARKS *(SO step then Confirmation step = two STATUS transitions on one row)* |

#### Item progress track (4)
| Tab | Headers |
|-----|---------|
| `DISPATCH_APPROVAL` | DAP_ID, ITEM_ID, ORDER_ID, ORDER_QTY, PLANNED_QTY, ACTUAL_QTY, APPROVED_QTY, SHORT_QTY, EXCESS_QTY, BALANCE_QTY, NEXT_EXTENDED_DATE, REMARKS |
| `PRODUCTION` ✅ confirmed | PRD_ID, ITEM_ID, ORDER_ID, CONFIRMATION (Yes/No), BALANCE_QTY, AVAILABLE_STOCK, TO_BE_PRODUCED, PRODUCED_QTY, NEW_BALANCE_QTY, START_DATE, EST_COMPLETION_DATE, NEXT_FOLLOWUP_DATE, SUPERVISOR, PRODUCTION_STAGE, DELAY_DAYS, REMARKS |
| `PDI` | PDI_ID, ITEM_ID, ORDER_ID, QTY, SAMPLE_SIZE, BOX_QTY, PRODUCT_WEIGHT_G, PDI_DATE, PDI_ATTACHMENT_URL, LOAD_DEFLECTION_URL, BOX_MARKING_URL, PDI_REMARKS, SENT_TO_CUSTOMER (Y/N), PROOF_URL |
| `PACKING` | PCK_ID, ITEM_ID, ORDER_ID, QTY, BOX_QTY, PACKING_TYPE, PACKAGING_NUG, PACKAGING_CODE |

#### Vehicle/logistics track (8)
| Tab | Headers |
|-----|---------|
| `TRIPS` | TRP_ID, VEHICLE_ARRANGED_FOR (Customer/ZOTO), SEND_THROUGH (Local Vehicle/Transporter), TPT_ID, TRANSPORTER_NAME*, VEHICLE_TYPE, VEHICLE_NO, VEHICLE_SIZE_FT, DRIVER_NAME, DRIVER_CONTACT, FREIGHT_ON_INVOICE (Y/N), FREIGHT_CHARGE, FREIGHT_GST_APPLICABLE (Y/N), SECOND_DROP_TPT_ID, SECOND_FREIGHT_PAID_BY, DESCRIPTION |
| `TRIP_ORDERS` | TRP_SO_ID, TRP_ID, ORDER_ID, FREIGHT_PAID_BY, FREIGHT_PAID_AT, MARKA_CODE, GATE_PASS_URL |
| `TRIP_ITEMS` | TRP_PD_ID, TRP_ID, ORDER_ID, ITEM_ID, BALANCE_TO_DISPATCH, LOAD_QTY, NEW_BALANCE, LOAD_BOXES |
| `TRIP_REACHED` | TRP_RCH_ID, TRP_ID, REACHED (Y/N), SAME_VEHICLE (Y/N), EXPECTED_DATETIME, REASON |
| `STOCK_RELEASE` | STK_ID, TRP_ID, ITEM_ID, ORDER_ID, QTY, RELEASE_QTY, TYPE, FROM_LOCATION, DESCRIPTION, SIGNATURE_URL |
| `TAX_INVOICES` | INV_ID, TRP_ID, ORDER_ID, TALLY_BOOK (fixed: Tally 1 (Registered)), INVOICE_NO, INVOICE_DATE, INVOICE_ATTACHMENT_URL, BUYER_NAME*, BUYER_GSTIN*, BILLING_ADDRESS*, SHIPPING_ADDRESS*, CONSIGNEE_NAME*, CONSIGNEE_GSTIN*, DC_NO, DC_DATE, DC_ATTACHMENT_URL, INVOICE_DISCOUNT_RS, BASIC_AMOUNT, TAX_AMOUNT, TOTAL_AMOUNT, EWAY_APPLICABLE (Y/N), EWAY_NO, EWAY_DATE, EWAY_ATTACHMENT_URL, REMARKS *(full buyer snapshot frozen at invoice time — legal record)* |
| `INVOICE_ITEMS` | INV_ITM_ID, INV_ID, ITEM_ID, ORDER_ID, QTY, PRICE, DISCOUNT_RS, DISCOUNT_PCT, BASIC_AMOUNT, GST_SLAB_PCT, CGST, SGST, IGST, TAX_AMOUNT, TOTAL_AMOUNT |
| `DISPATCH_DELIVERY` | DDL_ID, TRP_ID, INV_ID, DISPATCHED (Y/N), DISPATCH_DATETIME, GATE_PASS_URL, FREIGHT_CHARGES, OTHER_CHARGES, PAYMENT_STATUS, REASON, NEXT_DISPATCH_DATETIME, LR_NO, LR_DATE, LR_ATTACHMENT_URL, LR_CHARGES, LR_GIVEN_TO_CUSTOMER (Y/N), DELIVERED (Y/N), EXPECTED_DELIVERY_DATE, RECEIVING_ATTACHMENT_URL, DELIVERY_CHARGES, DELIVERY_REMARKS *(one row per trip-leg; STATUS walks DISPATCHED → LR_COLLECTED → DELIVERED — replaces 5 reference tabs)* |

#### Cross-cutting + system (4)
| Tab | Headers |
|-----|---------|
| `REMARKS_LOG` | RMK_ID, ORDER_ID, TRP_ID, STEP, STEP_REF_ID, REMARKS, IMAGE_URL, FILE_URL |
| `SAMPLES` | SMP_ID, CUST_ID, FG_ID, QTY, REQUEST_DATE, SENT_DATE, TRP_ID, FEEDBACK, SAMPLE_STATUS (Requested/Sent/Feedback Received) — *plus normal orders can carry SALE_TYPE=Sample* |
| `USERS` | EMAIL, NAME, ROLE, MODULES, CAN_ADD, CAN_EDIT, CAN_DELETE, ACTIVE *(replaces reference UI/Permissions/Email & Work)* |
| `COUNTERS` | COUNTER_KEY, LAST_VALUE *(API ID issuance)* — plus `DROPDOWNS` (LIST_NAME, VALUE, SORT_ORDER, ACTIVE) if enum lists shouldn't live in code |

### B.5 Old → New mapping

| Reference tab(s) | → ZOTO | Notes |
|------------------|--------|-------|
| Customer Data / ADC Branch | external Customer master / (seller entity: single firm, config) | ADC Branch = seller entities; ZOTO v1 = one firm (constant in config) ⚠ confirm |
| Transporter Data | external Transport master | already seeded |
| (part data inside item tabs) | external FG Inventory master | |
| (pricing columns in items) | external BILLING STRATEGY MASTER | rate contract per customer+part |
| Order Punch Initial + Order Punch | ORDERS | DRAFT → PUNCHED status; no Tally split |
| Order Punch Items Initial/Items + Sale Order Items + SO Conf Items | ORDER_ITEMS | one row per item |
| Order Punch Dispatch (Initial) + SO Conf Dispatch | DISPATCH_PLAN | |
| Order Punch Discount | TAX_INVOICES.INVOICE_DISCOUNT_RS | |
| Sale Order + SO Confirmation | SALE_ORDERS | merged, 2 status steps |
| Pre Production Conf + Production Conf + Production Items | PRODUCTION | one running record per item |
| Dispatch Items Approval | DISPATCH_APPROVAL | |
| PDI Items | PDI | |
| Pre Transport | PACKING | |
| Transport (+Copy) / Transport_SO (+Copy) / Transport_Products / Transport_Reached | TRIPS / TRIP_ORDERS / TRIP_ITEMS / TRIP_REACHED | |
| Stock_Release | STOCK_RELEASE | |
| Tax_Invoice + Tax_Invoice_SO / Tax_Invoice_Products | TAX_INVOICES / INVOICE_ITEMS | |
| Pre Dispatch + Vehicle Dispatch + Dispatch + LR + Delivery | DISPATCH_DELIVERY | merged, sub-statuses |
| All Remarks Log | REMARKS_LOG | |
| UI + Permissions + Email & Work | USERS | |
| CRR DD | DROPDOWNS | |
| Transporter Ledger/Payment, Freight Collection, Reserved BOM, Filter, Sheet60, Copy-of tabs | — dropped (v2 / junk) | |

### B.6 Module cards → tabs

| Module | Tabs |
|--------|------|
| Punch Order | ORDERS + ORDER_ITEMS + DISPATCH_PLAN |
| Sale Order / SO Confirmation | SALE_ORDERS (two steps) |
| Dispatch Approval | DISPATCH_APPROVAL |
| (Production — new module card needed ✅) | PRODUCTION |
| PDI | PDI |
| Transport | TRIPS + TRIP_ORDERS + TRIP_ITEMS (+ PACKING) |
| Transport Reached | TRIP_REACHED |
| Stock Release | STOCK_RELEASE |
| Tax Invoice | TAX_INVOICES + INVOICE_ITEMS |
| Dispatch / Collect LR / Delivery | DISPATCH_DELIVERY (three steps) |
| Remarks | REMARKS_LOG |
| Sample | SAMPLES |

### B.7 Execution steps (next session step — after user approves this plan)

1. Create the 20 tabs in the ZOTO TRANSACTIONS sheet, row 1 = exact headers (§B.4), frozen + bold.
2. Add `_README` tab: ID scheme, enums, tab map, links to the 3 master sheets.
3. Data-validation dropdowns on enum columns.
4. Seed `USERS` with operations@theairtrap.com (Admin) + `COUNTERS` keys.
5. Update [05-BACKEND-SCHEMA.md](05-BACKEND-SCHEMA.md) to defer to this doc as the authoritative schema.

### B.8 Remaining open items

1. Fiscal year for ID series: today is 17 Jul 2026 → `26-27` series — confirm.
2. Seller/branch details (firm name, GSTIN, address for invoices): supply once, stored in config or a small `SELLER` tab.
3. Master data gaps to fill before go-live: Strategy ID + Part Code in BILLING STRATEGY MASTER; PART NO./SEGMENT/CATEGORY in FG INVENTORY.
4. Production module gets its own card in the UI (15 cards) — confirm placement after PDI decision at build time.
