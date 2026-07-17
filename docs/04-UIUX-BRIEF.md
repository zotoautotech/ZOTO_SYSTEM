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
