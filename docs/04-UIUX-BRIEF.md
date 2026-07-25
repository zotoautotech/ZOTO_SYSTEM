# 04 — UI/UX Brief

**Project:** ZOTO SYSTEM — Sales CRR
**Version:** 1.0 (Draft)
**Directive:** Replicate the existing SALES CRR-ADC-V5 look so the team needs **zero retraining**. All tokens below are read from the 5 screenshots; fine-tune against the live app during build.

---

## 1. Design Tokens

### Color
| Token | Value (approx.) | Usage |
|-------|-----------------|-------|
| `--color-primary` | `#E53935` (red) | Primary buttons (Next, Completed), active toggle fill, active tab underline, active rail icon background, `+` icon, alerts |
| `--color-primary-tint` | `#FDECEA` | Active filter row background ("All" selected), hover states |
| `--color-bg` | `#FFFFFF` | Cards, panels, forms |
| `--color-bg-page` | `#FAFAFA` | Page background behind cards |
| `--color-text` | `#212121` | Primary text |
| `--color-text-muted` | `#757575` | Placeholders, secondary labels, sync text |
| `--color-border` | `#E0E0E0` | Card borders, table lines, input outlines |
| `--color-error` | `#D32F2F` | Invalid input outline + "This entry is invalid" message |

### Typography
- Font: system sans (Roboto/Inter). Page titles ~20px medium; section headers ("Buyer Details") ~18px semibold; table header ~14px medium; body/cell ~14px regular; field labels ~14px regular, gray-black.
- Required fields: label followed by red asterisk `*`.

### Shape & spacing
- Cards/inputs/buttons: 6–8px radius, 1px `--color-border`, white fill, no heavy shadows (flat, bordered look).
- Slide-over form: full-height right panel, ~55% viewport width, above a dimmed/blurred list.
- Generous field spacing: label above input, ~24px vertical rhythm.

## 2. Layout Anatomy

```
┌──────────────────────────────────────────────────────────────┐
│ ☰  📈 SALES CRR-ADC-V5     [🔍 Search …]      Sync ⟳ ▾  (O) │ ← top bar 56px
├───┬──────────────────────────────────────────────────────────┤
│ 🏠 │ SALES CRR › Order Punch Pending › Pending Order Punch    │ ← breadcrumb row
│ 🛒 │ ┌────────────┬───────────────────────────────────────┐  │
│ 🖥 │ │ All      ◄ │ Status | Timestamp | Tally | ...      │  │
│ 👥 │ │ Cust A  2  │ ───────────────────────────────────── │  │
│ ⊞  │ │ Cust B  1  │ rows…                                 │  │
│ …  │ └────────────┴───────────────────────────────────────┘  │
└───┴──────────────────────────────────────────────────────────┘
  ↑ 64px icon rail (active icon: red circle bg + black tooltip)
```

## 3. Component Inventory

| Component | Spec (from screenshots) |
|-----------|------------------------|
| **ModuleCard** | White card, 1px border, left icon (colored, filled-outline style), 16px medium label; grid 4-col, 16px gap; hover: subtle shadow |
| **DataTable** | Sticky header row, 14px, column dividers, row height ~48px, horizontal scrollbar at bottom, no zebra stripes |
| **CustomerFilterPanel** | Left column ~260px; items = name + gray count badge; active item red-tinted pill |
| **CompletedToggle** | Red filled button with clipboard icon + "Completed…" label; toggles Pending ↔ Completed dataset |
| **SlideOverForm** | Header: ✕, title, actions right-aligned: `‹ Prev` (outlined), `Cancel` (outlined red text), `Next ›` (red filled). Tab bar below header |
| **FormTabs** | Horizontal tabs, inactive gray/muted, active black text + 3px red underline; disabled future tabs lighter gray |
| **ToggleGroup** | Full-width buttons; selected = red fill + white text; unselected = white + 1px border + dark text (e.g., Order Incoming/Outgoing; Credit/Advance; Existing/New/Prospective) |
| **TextInput / DateInput** | Label above; 1px border, 8px radius, 48px height; date shows `mm/dd/yyyy` + calendar icon right; focus/invalid = red outline |
| **FileDropzone** | Large bordered box with centered PDF icon; after upload shows file chip/link |
| **PercentInput** | `%` prefix inside field; inline error below: ⚠ icon + red "This entry is invalid" |
| **SearchableSelect** | For CUST ID etc.; dropdown chevron right; type-ahead over master data |
| **Breadcrumbs** | Gray links `>`-separated; last segment black, larger |
| **SyncIndicator** | Text "Sync complete" + refresh icon button + dropdown caret |
| **CountBadge** | Small gray rounded square with count |

## 4. Interaction Rules

- **Stepper:** `Next` validates current tab before advancing; invalid fields outlined red with message; final tab's primary button = `Submit`.
- **Toggles are instant** (no dropdowns for ≤3 options) — matches current app.
- **Conditional fields:** Advance Payment (%) appears only when Payment Type = Advance.
- **Master-driven autofill:** choosing CUST ID fills GSTIN/addresses downstream (editable where allowed).
- **Feedback:** button spinners on save; toast on success ("Order punched"); top-bar sync text updates.
- **Keyboard:** Enter advances tab when valid; Esc prompts Cancel confirm if dirty.

## 5. Responsive & Mobile (React Native, Phase 5)

- **Web:** desktop-first (1280px+). Below 1024px: rail collapses to hamburger drawer; filter panel becomes a dropdown chip row; table scrolls horizontally.
- **Mobile app:** same tokens; module grid 2-col; lists as cards (customer, status chip, timestamp) instead of wide tables; slide-over becomes full-screen stepper; bottom tab bar replaces icon rail.

## 6. Accessibility

- Red-on-white primary meets AA for large text/buttons; never rely on color alone (Pass/Fail, Pending/Completed carry text labels).
- All inputs labeled; error text tied via `aria-describedby`; focus rings visible; toggles are radio groups semantically.

## 7. Confirmed Implementation (Locked Reference — 2026-07-20)

The **Punch Order list page** (`Frontend/src/modules/order-punch/OrderPunchList.tsx` + `Frontend/src/components/Layout.tsx`) is the user-approved, pixel-matched reference for every list-style page going forward. New list pages (Modules, other future CRR lists) should copy this pattern rather than reinvent it. Locked specifics:

- **Sidebar brand mark**: red `Z` logo tile 36×36px + `ZOTO` wordmark, 21px / 700 weight, next to it. Collapses to icon-only via the `‹` toggle.
- **Top bar**: single row — search input (placeholder dynamically reads `Search {last breadcrumb label}`, wired via `useSetHeaderActions`/breadcrumb `crumbs` state, not hardcoded per page) — sync status text + refresh/chevron button group — theme toggle — account chip.
- **Breadcrumb + action row**: one flex row, `justify-content: space-between`, `borderBottom: 1px solid var(--color-border)` beneath it. Left = clickable breadcrumb trail (13px→**16px**, last segment **700 weight**, not 500). Right = page-specific action buttons registered via `useSetHeaderActions()` (see `lib/headerActions.tsx`) so they render in this shared row instead of a separate page-local title bar.
  - Standard action button set for list pages: icon-only `+` (new record, outlined, red icon), primary red "Completed…" pill (checkmark icon + label, toggles pending/completed dataset), icon-only filter button, icon-only checklist/select button. All 38×38px, `1px solid var(--color-border)`, `8px` radius, except the primary pill.
- **Customer filter panel + table**: vertical 1px divider between them, flush against the breadcrumb row's bottom border (no top margin/padding gap) so the vertical and horizontal dividers visually connect into one line, matching the legacy app.
- **Table scroll**: whole list area (`filter panel + divider + table`) is wrapped in a flex column with `minHeight: calc(100vh - 128px)`, and the table's own scroll container (`DataTable.tsx`, class `sheet-scroll`) stretches `height: 100%` so its horizontal scrollbar sits pinned at the very bottom of the viewport, not immediately under the last row.
- **Custom scrollbar look**: `.sheet-scroll` class in `theme/tokens.css` gives a thick (12px), rounded, gray spreadsheet-style scrollbar. WebKit-only (Chrome/Edge); Firefox falls back to native thin scrollbar — acceptable since the team tests in Chrome.
- Applied consistently to: Punch Order list, Order Detail's Parts table, Order Items View table (all three use `sheet-scroll`).
- **Bottom-pinned scrollbar** (2026-07-20 addendum): `OrderItemsView.tsx` now follows the same `flex column, minHeight: calc(100vh - 128px)` + table wrapper `flex: 1, overflow: auto` shape as the Punch Order list, so its horizontal scrollbar sits at the very bottom of the viewport instead of right under the last row. Its old duplicate title row ("‹ Order Punch Items View" h2 under the breadcrumb) was removed for the same reason the Module Home duplicate was removed — the breadcrumb's bold last segment already says it.
- **Full-bleed spreadsheet grid** (2026-07-20 addendum): dense/wide data tables (`OrderItemsView.tsx`) bleed edge-to-edge — `margin: "0 -24px"` cancels `main`'s `24px` side padding so the table's left edge touches the sidebar divider and its right edge reaches the browser edge, no card border/radius/shadow. First column gets `paddingLeft: 24` to compensate for the bled-out margin. **Header-only vertical dividers** — `<th>` cells get `borderRight: 1px solid var(--color-border)` (last column excluded), `<td>` body cells stay `borderBottom`-only with no vertical lines. Went through two reverts to land here: first tried vertical lines on both header and body (reverted, too busy), then no vertical lines at all (reverted, doesn't match the legacy app's header-only column separators) — header-only is correct. Reach for this pattern for any other page presenting a wide, dense, read-heavy data grid; keep the padded/bordered `.card` look for normal list pages like Punch Order.
- **Drag-resizable dividers** (2026-07-20 addendum): both structural dividers are draggable, matching the legacy app.
  - **Sidebar rail ↔ content** (`Layout.tsx`): the 1px border right of the icon rail is a 5px-wide invisible drag handle (`cursor: col-resize`). Drag to resize the rail 160–320px (default 208px = `--rail-width`); double-click resets. Only active when the sidebar is expanded (disabled while `collapsed`).
  - **Customer filter panel ↔ table** (`OrderPunchList.tsx` + `CustomerFilterPanel.tsx`): same drag-handle pattern, resizes the filter column 160–480px (default 260px); double-click resets. `CustomerFilterPanel` takes an optional `width` prop that overrides the `--filter-width` CSS var default.
  - Both use the same implementation shape: a `useRef` drag-state (`{ startX, startWidth }`), `window` `mousemove`/`mouseup` listeners added on `mousedown` and torn down on `mouseup`, `document.body.style.cursor = "col-resize"` while dragging. Copy this pattern for any other resizable split (e.g. a future Order Items View filter column) rather than reinventing it.
  - **Per-column drag-resize**: `OrderItemsView.tsx` extends the same drag pattern to individual table columns, spreadsheet-style. `table-layout: fixed` + `<colgroup>` driven by a `colWidths` state array (defaults in the `COLUMNS` const, e.g. Part No. 120px, Part Name 220px). Each `<th>` has an invisible 6px drag handle on its right edge; double-click resets that column to its default width. Cell text gets `overflow: hidden; text-overflow: ellipsis` so a narrowed column truncates instead of breaking layout.
- **Header-only vertical dividers apply to every parts table, not just Order Items View**: `OrderDetail.tsx`'s inline "Order Punch Parts" card table uses the same `borderRight: 1px solid var(--color-border)` on every `<th>` except the last (body `<td>` stays borderBottom-only). Any other card-embedded data table added later should follow this same header-divider rule for consistency.

- **SO Confirmation queue** (2026-07-23): after the Sale Order upload form saves successfully, it closes and redirects straight to `/modules/so-confirmation`. `SoConfirmationList.tsx` follows the approved Punch Order list pattern: customer filter panel on the left, connected vertical divider, and a full-height horizontally scrollable table on the right. It shows the saved `SALE_ORDERS` fields needed for review — status, saved timestamp, Sale Order No./Date, order/payment type, customer, GSTIN, and total amount. On phones it switches to the same compact status/customer/SO-number cards used by other lists. Keep this queue table-based; do not fall back to the generic placeholder module.
  - The right-side **Completed…** toggle is identical to Sale Order: it switches between open and completed confirmation records. Clicking any row opens the copied Sale Order detail view under the SO Confirmation route, including its Sale Order Details card and line-item links.
  - The SO Confirmation detail's left action rail includes **Take SO Confirmation Form**. Its first-phase modal copies the reference: Confirmation Details is the active tab, with Confirmed / Changes / Cancelled choices. Selecting **Confirmed** reveals exactly four fields: Received Payment Amount, Payment Amount (%), Payment Attachment, and Confirmed Remarks. This phase is visual only; persistence and the remaining tabs follow later.
- **Attachment viewer** (2026-07-23): the private attachment viewer follows Google Drive's dark-canvas pattern: images open centered and fitted fully into the available viewport, with the filename/download header above. A compact bottom zoom control (`−`, `Fit`, `+`) lets the viewer inspect larger detail; only zoomed images scroll in the right-side 14px gray scrollbar. Do not open full-resolution images oversized by default.

- **Select mode + bulk delete** (2026-07-20 addendum, `OrderPunchList.tsx`): the "Select" header-action icon button (previously a no-op placeholder) is now only rendered for users with the `CAN_DELETE` permission (see `docs/05-BACKEND-SCHEMA.md` §1.5), and clicking it enters select mode:
  - The breadcrumb trail's left slot is swapped for `✕ {N} Selected` via a new `useSetHeaderLeft()` hook (mirrors `useSetHeaderActions()`, same `lib/headerActions.tsx` context) — the `✕` exits select mode and clears the selection.
  - The right-side action button group swaps to a single red "Delete" button (disabled until at least one row is checked).
  - `DataTable.tsx` gained a `selectable`/`getRowKey`/`selectedKeys`/`onToggleRow` prop set: a checkbox column appears, row clicks toggle selection instead of navigating, and checked rows get a `--color-primary-tint` background. This is a generic addition — any other list page can opt into the same select-mode pattern by wiring the same props plus a `useSetHeaderLeft`/`useSetHeaderActions` pair, rather than reinventing it.
  - Delete itself opens a confirm `Modal` ("Delete N orders? … can't be undone") before calling the backend; see §1.5 in the schema doc and `Backend/src/routes/orders.ts`'s `DELETE /orders` for the actual cascade-delete logic.

**When building/fixing any other page**: match this file's tokens and structure first; only diverge with an explicit user instruction to do otherwise.

## 8. Mobile/Responsive Pass (Locked Additive Layer — 2026-07-20)

### Header naming

- On the Home route (`/`), the header breadcrumb and search placeholder use **HOME**. Sales CRR remains the label only for Sales CRR routes.

The whole app (11 routed pages behind `Layout`, plus the standalone `Login`/`Privacy`/`Terms` pages) went from desktop-only (zero `@media` queries anywhere in `src`, several hard-coded fixed pixel widths) to responsive across phone/tablet, **without changing desktop rendering at all**. This section is additive on top of everything above — §1–§7 describe the ≥1024px experience, which remains byte-identical; this section describes what happens below that.

### Breakpoints

Defined once in `Frontend/src/lib/responsive.ts` (`useMediaQuery`, `useIsCompact`, `useIsMobile` hooks — matches the codebase's inline-style convention rather than CSS classes, since an inline `style` attribute always wins over a `@media` rule without resorting to `!important`, which this codebase never uses):
- **Desktop (locked): ≥ 1024px** — everything in §1–§7 applies exactly as written, enforced by gating every mobile/tablet change behind `isCompact`/`isMobile` conditionals or a `clamp()` that plateaus at today's exact value above this width.
- **Compact (`isCompact`, drives structural chrome changes): ≤ 1023px.**
- **Mobile (`isMobile`, drives the tighter changes — icon-only header, stacked fields, chip rows): ≤ 599px.** 600–1023px ("tablet") gets compact chrome but keeps more side-by-side room where it fits.

### Per-file mobile behavior

- **`Layout.tsx`**: sidebar becomes a fixed-position off-canvas drawer (`width:260`, `translateX` slide, `rgba(0,0,0,.4)` backdrop, z-index 40/41 — below `OrderPunchForm`'s 50 and `Modal.tsx`'s 100) on `isCompact`, triggered by a hamburger button that replaces the header's empty first grid cell. Drawer auto-closes on route change. The desktop collapse-toggle/drag-resize-handle are both desktop-only now (`!isCompact` guards added alongside their existing `{!collapsed && …}` checks) — a derived `effectivelyCollapsed = collapsed && !isCompact` variable feeds every render decision that used to read `collapsed` directly, so the drawer always renders "expanded" regardless of the desktop collapse state. Header grid becomes `auto 1fr auto` on compact; on `isMobile` the "Sync complete" text, the sync-details caret button, and the account chip's name label are all dropped (icon-only). Breadcrumb+actions row gets `flexWrap: isCompact ? "wrap" : "nowrap"` so page-injected action buttons drop to a second line instead of overflowing. `main` padding shrinks `24px → 12px` on compact.
- **`Modal.tsx`**: `width: 480` → `width: "min(480px, calc(100vw - 32px))"` — identical to today at ≥512px, only shrinks below that. Fixes both `AddNewCustomerModal.tsx` and `AddNewPartModal.tsx` automatically.
- **`Login.tsx`**: content row wraps on `isCompact`. The user-locked desktop logo (`height:140, marginTop:-90` — "do not change again") retains those exact desktop values. On phones, the welcome words and the ZOTO logo sit together on one centered horizontal line, followed immediately by the divider/tagline and then the centered login card — matching the compact single-column reference layout without changing ZOTO's white brand theme. The wrapped rows use `alignContent:"flex-start"`; this is required so flexbox does not distribute the brand block and card across the full page height, which would create a blank gap and push the legal footer off-screen. Login card: `flex:"1 1 auto", width:"100%", maxWidth:460` on compact — centered, not left-anchored. Footer stacks copyright/links vertically on `isMobile`.
- **`Login.tsx`**: content row wraps on `isCompact`. The user-locked desktop logo (`height:140, marginTop:-90` — "do not change again") retains those exact desktop values. On phones, the welcome words and the ZOTO logo sit together on one centered horizontal line, followed immediately by the divider/tagline and then the centered login card — matching the compact single-column reference layout without changing ZOTO's white brand theme. The wrapped rows use `alignContent:"flex-start"`; this is required so flexbox does not distribute the brand block and card across the full page height. Mobile uses `height:100dvh` (the true usable phone viewport) so the copyright, Privacy and Terms footer remains pinned and visible below the form. Login card: `flex:"1 1 auto", width:"100%", maxWidth:460` on compact — centered, not left-anchored. Footer stacks copyright/links vertically on `isMobile`.
- **`OrderDetail.tsx` / `OrderItemDetail.tsx`**: outer row gets `flexWrap: isCompact ? "wrap" : "nowrap"`; the `flex:"0 0 260px"` info column and the two `flex:1` content columns all become `flex:"1 1 100%"` on compact (full-width stacked rows instead of squeezed side-by-side columns). Each file's local `Field` component (not shared between them — kept duplicated, surgical diff) stacks its label above its value (`flexDirection:"column"`) on `isMobile` instead of a fixed 140px label column.
- **`OrderPunchForm.tsx`**: overlay padding drops to 0 and the card goes true full-screen (`height/maxHeight:"100vh"`, `borderRadius:0`) on `isMobile`; already-responsive `width:"min(880px,100%)"` untouched. Stepper drops each tab's text label on `isMobile` (numbered circles + connector lines alone fit 4-across at 375px without the `minWidth:76` squeeze) and shows the active tab's name as a small heading above the stepper instead.
- **`CustomerFilterPanel.tsx` + `OrderPunchList.tsx`**: on `isMobile` only (tablet keeps the desktop side-by-side layout), the filter panel becomes a horizontal `overflowX:auto` chip row (`sheet-scroll` class reused for the scrollbar look) instead of a vertical button stack; `OrderPunchList`'s list-area row switches to `flexDirection:"column"` so the chip row sits above the table, and the drag-resize divider (mouse-only, doesn't apply once the panel isn't beside the table anymore) is omitted entirely.
- **Order Punch phone list:** use full-width tap cards, not a clipped horizontal spreadsheet. Each card shows status, timestamp, customer, order ID and PO number; Select mode taps select cards for deletion. Desktop retains the full table.
- **Order Punch form on phones:** use `100dvh` and a protected top header gap so the title and close button never hide behind browser chrome.
- **Order Punch form footer on phones:** reserve a 34px bottom safe area and add bottom padding to the action bar. Cancel, Prev and Next/Save remain completely above Android browser navigation; the fields area scrolls independently.
- **Customer selection:** selecting an existing customer immediately fetches and fills Billing Address, State, PIN and Country from Customer Master. Step 3 keeps a fallback lookup, so the data remains resilient if the initial request is delayed.
- **`OrderItemsView.tsx`**: the full-bleed `margin:"0 -24px"` / first-column `paddingLeft:24` trick is coupled to `Layout.tsx`'s `main` padding value — tracks it exactly (`isCompact ? "0 -12px" : "0 -24px"`, `paddingLeft: isCompact ? 12 : 24`) so the cancellation math stays correct at every breakpoint, not just desktop. Per-column drag-resize handles are simply not rendered on `isMobile` — columns keep their `COLUMNS`-authored default widths, reachable via the existing (now touch-scrollable, see below) horizontal `sheet-scroll` wrapper. No card/list reflow redesign attempted; a 16-column spreadsheet stays a scrollable spreadsheet on phones too, per the "usable, not redesigned" scope for this pass.
- **`theme/tokens.css`**: `.sheet-scroll` gained `-webkit-overflow-scrolling: touch` for iOS momentum scrolling on every table that uses the class.
- **`ModuleHome.tsx` / `Settings.tsx`**: needed zero code changes — `ModuleHome`'s `repeat(auto-fill, minmax(220px,1fr))` grid already auto-reflows to one column below ~460px, and `Settings`'s `maxWidth:680` + already-`flexWrap:"wrap"` header row already worked. Verified only, not touched.

### Product decisions carried through this pass

- **Drag-resize is desktop-only.** The sidebar rail, the customer filter panel, and `OrderItemsView`'s per-column resize are all mouse-event-only (`onMouseDown` + `window` `mousemove`/`mouseup`) with no touch-event equivalent. Rather than port them to touch gestures, they're simply not rendered/attached below the relevant breakpoint, and touch users get sensible fixed default widths instead. This was an explicit user decision, not an oversight.
- **A 16-column spreadsheet (`OrderItemsView`) is not redesigned into cards on mobile** — it stays a horizontally-scrollable table. The ask was "usable," not "redesigned."

## 9. Old Frontend Screen Reference — Transport → Delivery pipeline (capture only, not yet built)

Screenshots of the old **SALES CRR-ADC-V5** AppSheet frontend, captured batch-by-batch as
build reference for the new Transport/Tax Invoice/Dispatch/LR/Delivery module (currently
backend-only, see `Backend/src/routes/tripRoutes.ts`). **Reference only — do not build
against this section until explicitly told to.**

### 9.1 Nested Transport structure (3 levels)

```
Transport Main Form  (the trip — TRANSPORT tab)
  └─ "Select Sale Orders" picker (+ New)  →  Transport Form  (one order on this trip — Transport_SO tab)
        Tab "Sale Order Details": pick the Sale Order (single searchable dropdown)
        Tab "Logistics Details": per-order logistics override
          └─ "Select Products & Quantity" picker (+ New)  →  Transport Items Form (Transport_Products tab, "Load Limit Details" tab)
             "Selected Items Count" rollup shown back on the Logistics Details tab
```

AppSheet's standard nested-detail-view pattern (parent form has an inline "related list +
New button" that opens a child form, which can itself nest another picker) — confirms
`Transport` → `Transport_SO` → `Transport_Products` is a genuine 3-level parent/child/
grandchild relationship in the UI, not just in the sheet schema.

**Transport Main Form** — title "Transport Main Form", tab "Vehicle Details", footer at
**top** of modal (Cancel outline / Save red — differs from every other form built so far,
which puts the footer at the bottom). Fields, in order:
1. **Send Through\*** — 5-way toggle: `Courier` / `Porter` / `Transporter` / `Cust. Vehicle`
   / `Local Vehicle`.
2. **Vehicle Arrange for\*** — 3-way toggle: `Customer` / `Transporter booking` /
   `Multi Location`, with a note block explaining each:
   > Customer - If material direct dispatch to customer.
   > Transport Booking - If material dispatch for transport booking.
   > Multi location - If material dispatch by multiple points (Mostly used in Karol Bagh)
3. **Transporter ID\*** — searchable dropdown (live transporter-master lookup, e.g.
   "DELHIVERY SMALL WORLD", "RAHUL GOOD CARRIERS") — **only shown when Send Through =
   Transporter**.
4. **Vehicle type\*** — searchable dropdown, fixed list: `2/3/4/6/8/10/12 Wheeler`.
5. **Vehicle No.\*** — text
6. **Vehicle Size (Ft)\*** — number (`0` placeholder)
7. **Driver Name\*** — text
8. **Driver Contact No.\*** — text
9. **Freight Applicable On Invoice?\*** — toggle `N`/`Y`. **When Y**, reveals:
   - **Freight Charge\*** — currency (₹, `0.00`)
   - **Freight GST Applicable\*** — toggle `Yes`/`No`
10. **Description** — text (not required)
11. **"Select Sale Orders here that will transport through this vehicle."\*** — inline
    picker, red **New** button opens the child Transport Form.

**Transport Form** (child modal, opened via New) — 2 tabs, wizard style (`Cancel` / `Next ›`
on tab 1, `‹ Prev` / `Cancel` / `Save` on tab 2):
- Tab **Sale Order Details**: "Select Sale Order \*" — single searchable dropdown (one
  order at a time, not multi-select).
- Tab **Logistics Details**:
  1. **Preferred Delivery Mode\*** — same 5-way toggle as Send Through — a **per-order**
     override, independent of the trip-level Send Through.
  2. Helper text: *"Select the party that ultimately bears the freight expense (who will
     finally pay for the transportation cost)."*
  3. **Freight Paid by\*** — toggle `ADC` / `Customer`.
  4. Helper text: *"Select the stage at which the freight payment is made to the
     transporter."*
  5. **Freight Paid at\*** — toggle `Pay at ADC` / `Pay at Customer` (answers what the
     helper text above it was labeling).
  6. **"Select Products & Quantity here that will Dispatch in this vehicle."** + red **New**
     button → opens **Transport Items Form** (single tab "Load Limit Details" — fields not
     captured yet, form was empty/unpopulated in the screenshot taken).
  7. **Selected Items Count** — read-only rollup (`0.00000`), updates as products are added.

**Design implication:** two logistics layers exist — trip-level (Send Through, Freight
Applicable On Invoice, Freight Charge, Freight GST Applicable — on the Main Form) and
per-order-on-this-trip (Preferred Delivery Mode, Freight Paid by, Freight Paid at — on the
child form's Logistics tab). `Transport_SO`'s real sheet columns already anticipate both
layers; the new build hasn't exposed the per-order override in any form yet, and currently
auto-attaches an order's full item list rather than letting the doer pick products/qty.

### 9.2 Pre Transport (Pending Transport) — item-level list + detail

**Pending Transport list**: breadcrumb `SALES CRR > Pending Transport`, standard customer
filter panel + table. **This is an item-level list, not order-level** — one row per pending
line item. Columns: Timestamp, CUST ID, Customer Name, Balance Quantity, Balance BOX
Quantity, Unit, NUG/BOX Quantity, Packing Type, Part No., Old Part No., Part Name, Part
Desc[ription]… Header actions: checkmark toggle, red **"Arrange Ve[hicle]"** button (opens
Transport Main Form), filter icon, bulk-select checkbox icon.

**Pre Transport item detail** (opened from a list row, title = Part Name): header
`PRE-TPT-{id}` + timestamp + red "Update Log" button. Card layout:
- **Buyer Details**: CUST ID, Customer Name, Business Segment, Type of Customer, Buyer
  GSTIN No.
- **Special Instructions**: Packing Requirements (e.g. "need to create nug")
- **Goods Details**: Part No., Old Part No., Part Name, Part Description, Segment,
  Category, Sub Category, Paint, Standard Part, PDF
- **Load Limit Details**: Quantity, Box Quantity, Balance Quantity, Balance BOX Quantity,
  Unit, NUG/BOX Quantity, Packing Type, NUG/BOX Marka Code

### 9.3 Transport Reached Form

2 tabs: **Transport Reach Details** (default active) / **Vehicle Details** (only reachable
if a new vehicle is needed).
- **Transport Reached\*** — toggle `Yes`/`No`.
  - **If No**: reveals **Expected DateTime\*** (datetime picker) and **Reason\*** (text) on
    the same tab; footer is `Cancel`/`Save` (no second tab needed).
  - **If Yes**: reveals **Same Vehicle\*** — toggle `Yes`/`No`.
    - **Same Vehicle = Yes**: footer `Cancel`/`Save` (done, no new vehicle to capture).
    - **Same Vehicle = No**: footer becomes `Cancel`/`Next ›`, advancing to the **Vehicle
      Details** tab: Vehicle type\* (searchable dropdown, same 2–20 Wheeler list as
      elsewhere but longer here: up to `20 Wheeler`), Vehicle No.\*, Vehicle Size (Ft) (not
      required here), Driver Name (not required here), Driver Contact No.\*. Footer
      `‹ Prev`/`Cancel`/`Save`.

This is a materially richer conditional structure than our current single-tab
`transport-reached` stage form (`reached`/`sameVehicle`/`expectedDateTime`/`reason`/
`remarks` all shown flat) — the old UI branches into up to 3 different footer/field
combinations depending on the two toggle answers.

### 9.4 Stock Release

**Pending Stock Release list**: item-level (like Pre Transport). Columns: Part No., Billing
Part No., Part Name, Part Description, Vehicle type, Vehicle No., Vehicle Size (Ft), Load
Qty, Unit, Load Boxes. Red "Completed…" toggle, standard list chrome.

**Stock Release item detail**: header `TPT-PD-{id}` (a `Transport_Pd_ID`) + timestamp.
- **Goods Details**: Part No., Billing Part No., Part Name, Part Description, Segment,
  Category, Sub Category, Paint, Standard Part
- **Special Instructions** (empty in example)
- **Vehicle Details**: Vehicle type, Vehicle No., Vehicle Size (Ft), Driver Name, Driver
  Contact No.
- **Load Limit Details**: Load Qty, Unit, Load Boxes
- A **"Stock Release Form"** action icon opens the form below.

**Stock Release Form**: single tab "Stock Release Details". Fields: **From** (dropdown,
options not captured), **Description** (text), **Signature** (signature-pad widget — draw
with mouse/touch, shown with a sample scribble). Footer `Cancel`/`Save`. Notably: no visible
`Type`/`Release Quantity` fields in this capture — either scrolled past or those are
auto-computed rather than doer-entered (our current backend has `releaseType`/
`releaseQuantity` as inputs; may need to drop `releaseType` as a manual field and keep only
From/Description/Signature, or the real form has more fields below the fold).

### 9.5 Tax Invoice

**Pending Tax Invoice list**: order-level (not item-level, unlike PDI/Transport/Stock
Release). Columns: Status, Tally, Cutomer Name, Buyer GSTIN No., Freight Paid by, Freight
Paid at, Transport Mode, Transporter Name, Transporter GSTIN, Vehicle type, Vehicle No.,
Vehicle Size (Ft), Freight Applicable On Invoice, Freight Charge.

**Upload Tax Invoice Form** (modal): Tax Invoice No.\* (text), Tax Invoice Date (date), Tax
Invoice Attachment (PDF dropzone), Tax Invoice Remarks (text), **E-Way Bill Applicable**
toggle Yes/No — **when Yes**, reveals E-Way Bill No. (text), E-Way Bill Date (date), E-Way
Bill Attachment (PDF dropzone), E-Way Bill Remarks (text). Matches our current
`tax-invoice` stage fields closely, but confirms E-Way Bill fields should be conditionally
hidden until "Applicable" is toggled on, not always shown.

**Tax Invoice detail**: header `INVC-{id}` + timestamp + "Upload Tax Invoice Form" / "Update
Log" action icons.
- **GST Details**: Invoice Discount (Rs), Basic Amount, Tax Amount, Total Amount, GP /
  Invoice, GP / Invoice (%) — **GP (gross profit) fields are computed/shown here**, not in
  our current schema.
- **Vehicle Details**: Vehicle type, Vehicle No., Vehicle Size (Ft), Driver Name, Freight
  Applicable On Invoice, Freight GST (%), Freight GST Amount.
- **Logistics Details**: Delivery Mode, Freight Paid by, Freight Paid at, Transport Mode,
  Transporter Type, Transporter ID, Transporter Name, PAN, Transporter Contact No.,
  Transporter Person Name, Transporter Person Contact No., Transporter Address.
- **"All SO's of this Tax Invoice"** — inline mini-table (Customer Name, Sale Order No.,
  Sale Order Date, Sale Order Remarks) with an **Expand** link — this is exactly
  `Tax_Invoice_SO`'s rows for the invoice, shown inline on the parent detail rather than as
  a separate route. Same pattern for items:
- **"All Products of this Tax Invoice"** — inline mini-table (Timestamp, Part No., Old Part
  No., Part Name, Part Desc…) with Expand — `Tax_Invoice_Products`' rows.
- **Buyer Details**: Tally, CUST ID, Customer Name, Marka Code, Business Segment, Type of
  Customer, Buyer GSTIN No., Buyer Email ID, Buyer Contact No., Payment Type, Payment
  Terms, This Order Payment Terms, Contact Person Name, Contact Person Contact No., Sale
  Staff Name, Order given by, Ship to Consignee.
- **Billing Address** / **Shipping Address** / **Consignee Details** cards (Line 1/2, State,
  Pin code, Country each; Is Shipping Address Same flag).

**Design implication:** parent detail pages for trip-level tabs (Tax Invoice, and presumably
Dispatch) show their attached child rows (SO-level and item-level) **inline as expandable
mini-tables**, not as a separate route the doer navigates to. Our current plan of a flat
trip detail page listing attached orders should adopt this same inline-mini-table +
Expand-link pattern rather than a full separate list view per level.

### 9.6 Dispatch

**Pending Dispatch list**: order-level. Columns: Status, Timestamp, CUST ID, Customer Name,
Delivery Mode, Transport Mode, Transporter Name, Vehicle type, Vehicle No., Vehicle Size
(Ft), Driver Name. Header actions: "Dispatch Form" icon button + red "Completed…" toggle.
(Form itself not captured yet — list only.)

---

*(Further batches: user will send more screenshots in follow-up messages — append here
under new `9.x` subsections, not in a separate file. Do not begin implementation until the
user explicitly says to build.)*

### Verification method

Checked via a local Vite dev server (not the deployed site) at four widths — 375×812, 430×932, 768×1024, 1280×800 — using `resize_window` + `getComputedStyle`/`getBoundingClientRect` reads (more reliable ground-truth than this particular browser tool's screenshot pixel scaling, which has a display-only quirk unrelated to actual page layout — confirmed by cross-checking a visually-odd tablet screenshot against `getBoundingClientRect`, which showed the login card correctly centered with equal left/right gaps). Confirmed zero `document.documentElement.scrollWidth > window.innerWidth` overflow at every checked width on every checked page. Desktop (1280×800) values were spot-checked against the pre-change numbers (sidebar 208px, header grid track sizes, search 480px, login card 460px/40px 44px padding, logo 140px/-90px/56px) and matched exactly — the "locked" requirement holds. Authenticated pages (`OrderDetail`, `OrderItemsView`, order forms) were checked structurally with a synthetic local-only `localStorage` session (no real backend running against local dev, so no production data or credentials involved) since the assistant has no real login credentials; a full pass with real order data is worth a spot-check by the user on the next deploy.

---
*This file is kept in sync with the live UI by the assistant on every relevant change — no need to ask before updating it.*
