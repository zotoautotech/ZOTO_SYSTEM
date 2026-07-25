# Old Frontend (AppSheet) — UI Reference

Screenshots of the old **SALES CRR-ADC-V5** AppSheet frontend, captured from the user
batch-by-batch as build reference for the new ZOTO frontend. This doc records exact field
lists, labels, control types, and layout/ordering — enough to rebuild each screen faithfully
when implementation starts. **Capture only — no implementation until the user explicitly
says to build.**

---

## Batch 1 (5 screenshots)

### 1. PDI Items Form (modal, edit mode)

Title: "PDI Items Form". Single tab: **PDI Details** (red underline, active). Edit
(pencil) FAB top-right of the first field.

Fields, in order:
1. **PDI No.** — text input
2. **PDI Date** — date picker (`mm/dd/yyyy` placeholder, calendar icon)
3. **PDI Attachment** — file dropzone (PDF icon shown)
4. **Box Quantity** — number input (`0.00` placeholder)
5. **PDI Remarks** — text input

Footer: **Cancel** (left) / **Save** (right, red).

*(This is a subset of the full PDI Item Detail fields below — the form only lets the doer
edit PDI No./Date/Attachment/Box Quantity/Remarks; everything else is read-only/auto-filled
from upstream.)*

### 2. PDI Item Detail (read-only view)

Breadcrumb: `SALES CRR > Pending PDI > Completed PDI > {item name}` — confirms PDI has a
Pending/Completed toggle same as our queues, and the detail title is the **item's Part
Name**, not the order ID (this view is per-item, opened from an items list, not from the
order).

Header block: `PDI-ITM-13e2862b` (the PDI item ID) + timestamp (`15/07/2026, 12:49:20 pm`).

**Goods Details** card:
- Part No.
- Old Part No. *(not in our current schema — legacy/superseded part code)*
- Part Name
- Part Description
- Segment
- Category
- Sub Category
- Paint
- Standard Part
- PDF 2 *(attachment link, file icon)*

**Special Instructions** card — present but empty in this example (likely
Special Instructions / Packing Requirements / Additional Notes, collapsed when blank).

**Buyer Details** card:
- CUST ID
- Customer Name
- Business Segment
- Type of Customer
- Buyer GSTIN No.

**PDI Details** card:
- Quantity
- Unit
- Product Weight (g/pcs)
- Sample size
- Box Quantity
- PDI No.
- PDI Date
- PDI Attachment *(file link)*
- PDI Remarks
- Attachement Box Marking *(their spelling — file link)*
- Customer Marka Code

Layout: 3-column card grid (Goods Details + Special Instructions stacked in left column,
Buyer Details + PDI Details stacked in right column) — wider/richer than our current
2-column OrderDetail layout.

### 3. Pending Transport (list view)

Breadcrumb: `SALES CRR > Pending Transport`. Left sidebar: customer filter panel (same
pattern we already use — "All" + one row per customer). Search bar top: "Search Pending
Transport".

Columns (in order): Timestamp, CUST ID, Customer Name, Balance Quantity, Balance BOX
Quantity, Unit, NUG/BOX Quantity, Packing Type, Part No., Old Part No., Part Name,
Pa... *(truncated, likely Part Description onward)*.

**This is the eligible-items list, not an eligible-orders list** — one row per pending
line item (matches our `Pre Transport`/item-level granularity), not per order. Confirms the
"attach orders to a trip" screen should let the doer pick from item-level pending rows,
not just order-level rows.

Header actions (right side): a checkmark toggle icon, a red **"Arrange Ve[hicle]"**
button (opens the Transport Main Form below), a filter icon, and a checkbox icon (bulk
select, presumably for multi-row selection before "Arrange Vehicle").

### 4 & 5. Transport Main Form (modal — two states of the same form)

Title: "Transport Main Form". Single tab: **Vehicle Details**. Footer: **Cancel** (outline)
/ **Save** (solid red) — footer is at the *top* of this modal, not the bottom (differs from
every other form we've built so far).

Fields, in order:
1. **Send Through\*** — 5-way toggle: `Courier` / `Porter` / `Transporter` / `Cust. Vehicle`
   / `Local Vehicle`. Screenshot 4 has `Courier` selected; screenshot 5 has `Transporter`
   selected.
2. **Vehicle Arrange for\*** — 3-way toggle: `Customer` / `Transporter booking` /
   `Multi Location`. Both screenshots have `Multi Location` selected. A note block explains
   each option:
   > Customer - If material direct dispatch to customer.
   > Transport Booking - If material dispatch for transport booking.
   > Multi location - If material dispatch by multiple points (Mostly used in Karol Bagh)
3. **Transporter ID\*** — dropdown, **only appears when "Send Through" = Transporter**
   (present in screenshot 5, absent in screenshot 4 where Send Through = Courier). Confirms
   the form is conditionally rendered per Send Through choice, not just Vehicle Arrange For.
4. **Vehicle type\*** — dropdown
5. **Vehicle No.\*** — text input
6. **Vehicle Size (Ft)\*** — number input (`0` placeholder)
7. **Driver Name\*** — text input
8. **Driver Contact No.\*** — text input
9. **Freight Applicable On Invoice?\*** — 2-way toggle: `N` / `Y`
10. **Description** — text input (not required)
11. **Select Sale Orders here that will transport through this vehicle.\*** — a multi-select
    picker rendered as a bordered box with a red **"New"** button inside it (AppSheet's
    inline-add-row list widget). **This is the multi-order attach step** — confirms trip
    creation and order-attachment happen in **one combined form**, not two separate steps
    like our current `POST /transport-trips` then `POST /transport-trips/:id/orders`. The
    picker is a list of "Sale Order" rows the doer taps to select (each opens/adds a row),
    not a simple multi-select dropdown.

**Design implication for our build:** the new Transport form should combine trip
creation + order (and probably item-level, per screenshot 3) selection into one screen,
with Send Through and Vehicle Arrange For as the top-level toggles gating which fields
show — not a separate "create trip" step followed by a separate "attach orders" step.

---

## Batch 2 (5 screenshots) — clarifies the nested Transport structure

This batch reveals the real structure is **three nested levels**, not one flat form:

```
Transport Main Form  (the trip — Transport tab)
  └─ "Select Sale Orders" picker (+ New)  →  Transport Form  (one Sale Order attached to this trip — Transport_SO tab)
        Tab "Sale Order Details": pick the Sale Order
        Tab "Logistics Details": per-order logistics override
          └─ "Select Products & Quantity" picker (+ New)  →  (a 3rd, unseen-so-far form — Transport_Products tab, per item load qty)
             "Selected Items Count" shown as a rollup back on the Logistics Details tab
```

This is AppSheet's standard nested-detail-view pattern (parent form has an inline
"related list + New button" that opens a child form, which can itself have another nested
picker) — confirms `Transport` → `Transport_SO` → `Transport_Products` is a genuine
3-level parent/child/grandchild relationship in the UI, not just in the sheet schema.

### 1. Transport Main Form — Transporter ID dropdown (Send Through = Transporter)

Same form as Batch 1 #4/#5, but with the **Transporter ID\*** field's searchable dropdown
open, showing it's a live search against a transporter master list. Sample options visible:
DELHIVERY SMALL WORLD, Jharkhand Bengal Freight Carrier Private Limited, THE PROFESSIONAL
COURIERS, RAHUL GOOD CARRIERS, DELHI SHIMLA GOODS CARRIERS, MANOJ CARGO CARRIERS (+ one
partially obscured). Confirms **Transporter ID only appears when Send Through =
Transporter** (already noted in Batch 1) and is a proper searchable master lookup, not a
free-text field.

### 2. Transport Main Form — Vehicle type dropdown

Same form, **Vehicle type\*** dropdown open. Fixed option list: `2 Wheeler`, `3 Wheeler`,
`4 Wheeler`, `6 Wheeler`, `8 Wheeler`, `10 Wheeler`, `12 Wheeler`. Also a searchable
dropdown widget (same style as Transporter ID), even though the list is short/fixed —
consistent widget choice across the form rather than a plain `<select>`.

### 3. Transport Main Form — Send Through = Cust. Vehicle, Freight = Y (conditional fields)

Confirms two more conditional-field layers beyond what Batch 1 showed:
- With `Send Through = Cust. Vehicle`, no Transporter ID field (matches: only "Transporter"
  choice needs it).
- **Freight Applicable On Invoice? = Y** reveals two more fields that don't show when N:
  - **Freight Charge\*** — currency input (₹ prefix, `0.00` placeholder)
  - **Freight GST Applicable\*** — 2-way toggle `Yes` / `No` (Yes selected here)

Full conditional field order for this form now confirmed: Send Through → [Transporter ID if
Transporter] → Vehicle Arrange for → Vehicle type → Vehicle No. → Vehicle Size (Ft) →
Driver Name → Driver Contact No. → Freight Applicable On Invoice? → [Freight Charge +
Freight GST Applicable if Y] → Description → Select Sale Orders picker.

### 4. Transport Form (child modal) — "Sale Order Details" tab

Opened by tapping **New** on the Main Form's "Select Sale Orders" picker. Stacked on top of
the Main Form (both visible, parent dimmed). Two tabs: **Sale Order Details** (active, red
underline) / **Logistics Details**. Header: "Select Sale Order \*" — a single searchable
dropdown (not multi-select) showing customer/order names as options (e.g. "MANJU
ENTERPRISES PATNA"). Footer: **Cancel** / **Next ›** (red) — this is a wizard-style 2-tab
form, Next advances rather than Save.

**So attaching an order to a trip is: tap New → search-select one Sale Order → Next →** (see
next screenshot).

### 5. Transport Form (child modal) — "Logistics Details" tab

Second tab of the same child form. Footer now: **‹ Prev** / **Cancel** / **Save** (Next is
gone, this is the last tab). Fields:
1. **Preferred Delivery Mode\*** — same 5-way toggle as Send Through
   (Courier/Porter/Transporter/Cust. Vehicle/Local Vehicle) — `Cust. Vehicle` selected here.
   This is a **per-order** override of delivery mode, separate from the trip-level Send
   Through set on the Main Form.
2. Helper text: *"Select the party that ultimately bears the freight expense (who will
   finally pay for the transportation cost)."*
3. **Freight Paid by\*** — 2-way toggle `ADC` / `Customer` (`ADC` selected).
4. Helper text: *"Select the stage at which the freight payment is made to the
   transporter."* — labels the *next* section (no separate toggle control appeared before
   the next field in this screenshot; may be scrolled past, or this text labels "Select
   Products" itself as the "stage" selection.)
5. **"Select Products & Quantity here that will Dispatch in this vehicle."** + a red **New**
   button — the item/product-level picker (opens a 3rd-level form, not captured yet, that
   presumably matches `Transport_Products`: item, load quantity, box quantity, etc.).
6. **Selected Items Count** — a read-only rollup field (`0.00000`), auto-updated as products
   get added via the New picker above.

### Design implications for our build

- The new Transport module needs a genuinely nested flow, not a single flat form. Minimum
  viable mapping to what we already built (`tripRoutes.ts`'s `POST /transport-trips` then
  `POST /:id/orders`) is close in spirit but currently order-level-only for the attach step
  — the real UI lets the doer additionally pick per-order **logistics overrides** (delivery
  mode / freight-paid-by per order, distinct from the trip-level ones) and a **per-order
  item/quantity selection** (not just "attach the whole order with all its items", which is
  what our backend currently does automatically).
- Two logistics layers exist: trip-level (Send Through, Freight Applicable On Invoice,
  Freight Charge, Freight GST Applicable — on the Main Form) and per-order-on-this-trip
  (Preferred Delivery Mode, Freight Paid by — on the child Transport Form's Logistics tab).
  Our current `tripMap.ts`/`Transport_SO` write already has columns for both layers
  (`Transport_SO` has its own `Preferred Delivery Mode`/`Freight Paid by` distinct from
  `TRANSPORT`'s `Vehicle Arrange for`/etc.) — the sheet schema already anticipated this, we
  just haven't exposed the per-order override in any form yet.
- Searchable-dropdown is the standard control for any master lookup (Transporter ID, Vehicle
  type, Select Sale Order) — matches our existing `SearchableSelect` component, not a plain
  `<select>`.

---

*(Next batch: user will send more screenshots in a follow-up message — append here, not
in a new file. Do not begin implementation until the user explicitly says "build".)*
