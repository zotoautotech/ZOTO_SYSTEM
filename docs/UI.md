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

*(Next batch: user will send 5 more screenshots in a follow-up message — append here, not
in a new file. Do not begin implementation until the user explicitly says "build".)*
