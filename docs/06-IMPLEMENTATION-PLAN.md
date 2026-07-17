# 06 — Implementation Plan

**Project:** ZOTO SYSTEM — Sales CRR
**Version:** 1.0 (Draft)
**Build order (confirmed):** Documents → Web app + API → remaining modules → polish → React Native mobile.

---

## Prerequisites from the user (blockers ⛔ per phase noted)

1. ⛔ Phase 0: **Google Sheet link** with edit access (actual table headers) → reconcile [05-BACKEND-SCHEMA.md](05-BACKEND-SCHEMA.md)
2. ⛔ Phase 0: **GitHub access** (org/repo or invite)
3. Phase 3: **Remaining app-flow screenshots** (stage forms, Billing Address & Logistics tabs, Remarks, Sample)
4. Phase 0: Vercel account access (or we create the project and transfer)
5. Phase 1: Auth preference confirmation (Google Sign-In vs. email/password)

---

## Phase 0 — Foundations (0.5–1 day)

- [ ] Create GitHub repo `zoto-system`, monorepo scaffold per [02-TRD.md](02-TRD.md) §3 (npm workspaces: `apps/web`, `apps/api`, `packages/shared`), commit these `docs/`
- [ ] GCP project: enable Sheets + Drive APIs, create service account, download key
- [ ] Reconcile schema against user's real sheet; create TEST copy; share both with service account
- [ ] Create `ZOTO-ATTACHMENTS` Drive folder, share with service account
- [ ] Vercel project linked to repo; set env vars (`GOOGLE_SERVICE_ACCOUNT_KEY`, `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, `JWT_SECRET`, `ALLOWED_ORIGIN`)

**Acceptance:** `vercel dev` serves a hello endpoint that successfully reads a range from the TEST sheet.

## Phase 1 — API Foundation (2–3 days)

- [ ] `services/sheets.ts`: header-mapped `readTable` / `appendRow` / `updateRow` + in-memory cache (TTL 30–60 s, `?refresh=true` bypass)
- [ ] `services/ids.ts`: COUNTERS-based ID generation with retry on `ROW_VERSION` conflict
- [ ] `packages/shared`: TypeScript types + status enums + column maps for every tab (generated from reconciled schema)
- [ ] Auth: `/auth/login`, JWT middleware, role guard middleware reading `USERS` tab
- [ ] Masters endpoints: `GET /masters/{customers,transports,goods,billing-strategies}`
- [ ] Error handler, request logging, zod validation per route

**Acceptance:** Postman/`curl` suite green: login → fetch masters → 401 without token → role-forbidden case.

## Phase 2 — Web Shell + Order Punch End-to-End (4–5 days)

- [ ] Vite + React + TS app; theme tokens from [04-UIUX-BRIEF.md](04-UIUX-BRIEF.md); base components: TopBar (search, SyncIndicator), IconRail, Breadcrumbs, ModuleCard grid (14 cards), DataTable, CustomerFilterPanel, CompletedToggle, SlideOverForm, FormTabs, ToggleGroup, inputs (Text/Date/Percent/SearchableSelect/FileDropzone)
- [ ] Login page → JWT storage → routing guard
- [ ] **Order Punch module complete:** pending/completed lists (columns per screenshot), customer filter with counts, 4-tab stepper form with validations (required PO No., Advance % 0–100 inline error, conditional Advance field, CUST ID dropdown from Customer Master)
- [ ] `POST /orders` + `GET /orders?stage=&status=` wired; attachments via `POST /uploads` → Drive
- [ ] Deploy to Vercel preview; user acceptance against current app side-by-side

**Acceptance:** User punches a real order in the preview app and sees the row (with correct Timestamp/Tally/Order Type/Payment Type/Customer/GSTIN) in Pending Order Punch **and** in the Google Sheet.

## Phase 3 — Pipeline Modules (5–8 days, order = pipeline order)

For each of: Sale Order (+ line items) → SO Confirmation → Dispatch Approval → PDI → Transport → Transport Reached → Stock Release → Tax Invoice → Dispatch → Collect LR → Delivery:

- [ ] Stage list (reuses DataTable pattern) + stage completion form per [03-APP-FLOW.md](03-APP-FLOW.md) §5 table
- [ ] `POST /orders/:id/stages/:stage` hand-off logic (mark COMPLETED, advance CURRENT_STAGE, create next PENDING row)
- [ ] Order timeline view (all stages of an order, from any module)
- [ ] Remarks + Sample modules (after user shares their screenshots)
- [ ] Rejection routing per user's answer to PRD open question #1

**Acceptance:** One order driven from Punch to Delivery in the preview app; every stage row visible in the sheet; queues empty/fill correctly.

## Phase 4 — Polish & Hardening (2–3 days)

- [ ] Global search across modules; module-scoped search
- [ ] Conflict UX (`ROW_VERSION` mismatch → refresh prompt); sync states; toasts
- [ ] Loading/empty states, responsive pass (≥1024px collapse rules), keyboard flow
- [ ] Seed/verify masters admin screens (Admin role) — simple CRUD tables
- [ ] Production cutover: LIVE spreadsheet, domain, `main` branch protection

**Acceptance:** Team uses production app for one full real order cycle without touching the old app.

## Phase 5 — React Native Mobile (5–7 days, separate approval)

- [ ] Expo app in `apps/mobile`, shared types/api client from `packages/shared`
- [ ] Login, module grid (2-col), card-style stage queues, full-screen stepper forms, attachment capture via camera/files
- [ ] Push notifications for "new record in your queue" (evaluate Expo Notifications)
- [ ] EAS builds for Android first (> confirm platform priority), then iOS

**Acceptance:** Logistics user completes Transport → Delivery stages from a phone.

---

## Timeline Summary

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| 0 Foundations | 0.5–1 d | ~1 d |
| 1 API | 2–3 d | ~4 d |
| 2 Shell + Order Punch | 4–5 d | ~9 d |
| 3 Pipeline modules | 5–8 d | ~17 d |
| 4 Polish + go-live | 2–3 d | ~20 d |
| 5 Mobile | 5–7 d | ~27 d |

## Risks

| Risk | Mitigation |
|------|-----------|
| Real sheet headers differ from draft schema | Phase 0 reconciliation before any code depends on names; column maps centralized in `packages/shared` |
| Sheets rate limits under multi-user load | API cache + batched reads; monitor via logging; escalate to per-year spreadsheets if needed |
| Remaining screenshots change assumed flows | Stage forms isolated per module — rework contained |
| Vercel serverless cold starts + Sheets latency | Keep functions warm via cron ping if needed; cache masters |
