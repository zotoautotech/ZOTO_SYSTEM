# ZOTO SYSTEM — Sales CRR

Custom rebuild of the SALES CRR-ADC-V5 order-to-delivery app.
**Stack:** React.js (web) · React Native (mobile, later) · Node.js API · Google Sheets (database) · Vercel (hosting) · GitHub (source).

## Documents

| # | Document | Purpose |
|---|----------|---------|
| 1 | [PRD — Product Requirements](docs/01-PRD.md) | What we're building and why; modules, roles, lifecycle |
| 2 | [TRD — Technical Requirements](docs/02-TRD.md) | Architecture, stack, Sheets-as-DB strategy, API design |
| 3 | [App Flow](docs/03-APP-FLOW.md) | Screen-by-screen navigation and pipeline flow |
| 4 | [UI/UX Brief](docs/04-UIUX-BRIEF.md) | Design tokens and components matching the current app |
| 5 | [Backend Schema](docs/05-BACKEND-SCHEMA.md) | Google Sheets tabs and column headers (draft, to reconcile) |
| 6 | [Implementation Plan](docs/06-IMPLEMENTATION-PLAN.md) | Phased build plan with acceptance criteria |
| 7 | [Sheet Redesign Plan](docs/07-SHEET-REDESIGN-PLAN.md) | Reference-sheet data-flow analysis (ID chain) + redesigned ZOTO tab/column schema |

## Status

🟡 **Documentation phase — awaiting review.** Sections marked `DRAFT — to confirm` need:

1. Google Sheet link (edit access) with the real table headers
2. Remaining app-flow screenshots (stage forms, Billing Address & Logistics tabs, Remarks, Sample)
3. GitHub repo access
4. Answers to the open questions in [01-PRD.md](docs/01-PRD.md) §9
