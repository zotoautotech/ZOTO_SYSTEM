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
- **Full-bleed spreadsheet grid** (2026-07-20 addendum): dense/wide data tables (`OrderItemsView.tsx`) bleed edge-to-edge — `margin: "0 -24px"` cancels `main`'s `24px` side padding so the table's left edge touches the sidebar divider and its right edge reaches the browser edge, no card border/radius/shadow. Every `<th>`/`<td>` gets both `borderBottom` **and** `borderRight` (`1px solid var(--color-border)`) for full spreadsheet-style grid lines (not just horizontal row lines) — first column gets `paddingLeft: 24` to compensate for the bled-out margin, last column drops its `borderRight`. Reach for this pattern for any other page presenting a wide, dense, read-heavy data grid; keep the padded/bordered `.card` look for normal list pages like Punch Order.
- **Drag-resizable dividers** (2026-07-20 addendum): both structural dividers are draggable, matching the legacy app.
  - **Sidebar rail ↔ content** (`Layout.tsx`): the 1px border right of the icon rail is a 5px-wide invisible drag handle (`cursor: col-resize`). Drag to resize the rail 160–320px (default 208px = `--rail-width`); double-click resets. Only active when the sidebar is expanded (disabled while `collapsed`).
  - **Customer filter panel ↔ table** (`OrderPunchList.tsx` + `CustomerFilterPanel.tsx`): same drag-handle pattern, resizes the filter column 160–480px (default 260px); double-click resets. `CustomerFilterPanel` takes an optional `width` prop that overrides the `--filter-width` CSS var default.
  - Both use the same implementation shape: a `useRef` drag-state (`{ startX, startWidth }`), `window` `mousemove`/`mouseup` listeners added on `mousedown` and torn down on `mouseup`, `document.body.style.cursor = "col-resize"` while dragging. Copy this pattern for any other resizable split (e.g. a future Order Items View filter column) rather than reinventing it.

**When building/fixing any other page**: match this file's tokens and structure first; only diverge with an explicit user instruction to do otherwise.

---
*This file is kept in sync with the live UI by the assistant on every relevant change — no need to ask before updating it.*
