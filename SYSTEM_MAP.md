# Beta System - System Map

Generated from repository scan on 2026-02-26, plus the MySQL dump provided by the user.

## 1) Architecture Snapshot

- Monorepo with:
- `backend/`: Node.js + Express API, Socket.io, WhatsApp automation, cron schedulers, RBAC, MySQL access.
- `frontend/`: React + Vite SPA with admin panel and client portal.
- `backend/python_scripts/`: helper/daemon scripts for XPayz, USDT, Telegram, and Gemini OCR.
- `db/migrations/`: incremental schema and permission migrations.

Core product shape:
- Admin operations console (invoices, manual confirmation, broadcasting, subaccounts, RBAC, settings).
- Client portal for subaccount transaction visibility and confirmations.
- Automation engine driven by WhatsApp message ingestion + external transaction sources (XPayz/Trkbit/USDT/Alfa/Telegram).

## 2) Tech Stack

Backend:
- Node.js, Express 4, mysql2/promise, Socket.io, whatsapp-web.js, BullMQ, node-cron.
- File uploads via Multer.
- Exports via ExcelJS and PDFKit.
- External HTTP via Axios.

Frontend:
- React 19, React Router, Styled Components, Framer Motion, Axios, Socket.io-client.

Python:
- `requests`, `mysql-connector`, `telethon`, `google-generativeai`, `pdf2image`.

Data:
- MySQL (primary app data).
- Redis required by BullMQ queue in `whatsappService` (`localhost:6379` hardcoded).

## 3) Runtime Process Map

Main web process:
- `backend/server.js`
- Serves API + static frontend build + Socket.io.
- Initializes:
- `whatsappService.init(io)`
- `broadcastScheduler.initialize(io)`
- `scheduledWithdrawalScheduler.initialize()`

Long-running/auxiliary daemons (separate process execution):
- `backend/alfaSyncService.js`: sync `alfa_transactions` every minute.
- `backend/xpayzSyncService.js`: sync XPayz subaccounts every 5 seconds.
- `backend/trkbitSyncService.js`: sync Trkbit transactions every minute.
- `backend/usdtSyncService.js`: sync USDT wallet tx every minute.
- `backend/services/bridgeLinkerService.js`: link `bridge_transactions` to `xpayz_transactions` every 5 seconds.
- `backend/python_scripts/telegram_listener.py`: real-time + historical Telegram ingestion to `telegram_transactions`.

Manual/one-off utilities:
- `backend/trkonetimesync.js`, `backend/export*.js`, `backend/create-user.js`, `backend/testserver.js`.

## 4) Frontend Route and Page Map

Top-level routes (`frontend/src/App.jsx`):
- `/login` -> `LoginPage` (admin auth).
- `/*` -> `MainLayout` behind `ProtectedRoute`.
- `/portal/login` -> `ClientLoginPage`.
- `/portal/impersonate` -> `PortalImpersonate`.
- `/portal/*` -> `PortalLayout` behind `PortalProtectedRoute`.
- `/portal/dashboard` -> `ClientDashboard`.
- `/portal/view-only` -> `ClientViewOnlyDashboard`.

Admin pages (`MainLayout`):
- `/invoices` -> invoices CRUD/export/media + linking.
- `/manual-review` -> pending forwarded confirmations + match/reject flows.
- `/client-requests` -> wallet/request inbox operations.
- `/broadcaster` -> immediate broadcast + batch/template tooling.
- `/scheduled-broadcasts` -> recurring broadcast jobs.
- `/scheduled-withdrawals` -> recurring and on-demand withdrawals.
- `/subaccounts` -> subaccount CRUD, credential reset, hard refresh, portal impersonation token, transaction reassignment.
- `/position` -> local/remote position counters and calculations.
- `/sub-customers` -> subcustomer financial table.
- `/trkbit` -> cross-intermediation table/export/unlink.
- `/alfa-trust` -> Alfa bank statement table/export.
- `/ai-forwarding` -> keyword forwarding rules.
- `/direct-forwarding` -> source->destination forwarding rules.
- `/auto-confirmation` -> global toggle settings.
- `/abbreviations` -> abbreviation dictionary management.
- `/group-settings` -> group forwarding/archiving flags.
- `/request-types` -> request trigger regex definitions/order.
- `/usdt-wallets` -> monitored wallet CRUD/toggle.
- `/users`, `/roles`, `/audit-log` -> RBAC admin suite.
- `/pin-messages` -> pin message campaign creation/history/retry.

Redirected/legacy routes in UI:
- `/wallet-requests` redirects to `/client-requests`.
- `/chave-pix` redirects to `/subaccounts`.

## 5) Backend API Route Catalog

Server-level routes (`server.js`):
- `POST /api/portal/auth/login`
- `POST /portal/bridge/confirm-payment` (portal JWT middleware)
- `USE /api/portal` -> protected `portalRoutes`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `USE /api` -> protected `adminApiRoutes`
- `STATIC /uploads/broadcasts/*`

Protected portal routes (`/api/portal` + portal auth):
- `GET /transactions`
- `GET /dashboard-summary`
- `GET /export-excel`
- `GET /trkbit/transactions`
- `POST /transactions/confirm`
- `POST /transactions/notes`
- `POST /transactions/debit`
- `POST /trkbit/transactions/claim`

Protected admin routes (`/api` + admin auth + permissions):

RBAC/Admin:
- `GET /admin/users`
- `POST /admin/users`
- `PUT /admin/users/:id`
- `DELETE /admin/users/:id`
- `GET /admin/roles`
- `POST /admin/roles`
- `PUT /admin/roles/:id`
- `DELETE /admin/roles/:id`
- `GET /admin/roles/:id/permissions`
- `PUT /admin/roles/:id/permissions`
- `GET /admin/audit-log`

WhatsApp/Broadcast core:
- `GET /status`
- `GET /groups`
- `POST /groups/sync`
- `POST /broadcast`
- `POST /pins`
- `GET /pins`
- `GET /pins/:id`
- `POST /pins/:id/retry`

Batches/Templates/Uploads:
- `GET /batches`
- `POST /batches`
- `GET /batches/:id`
- `PUT /batches/:id`
- `DELETE /batches/:id`
- `GET /templates`
- `POST /templates`
- `PUT /templates/:id`
- `DELETE /templates/:id`
- `GET /broadcasts/uploads`
- `POST /broadcasts/upload`
- `DELETE /broadcasts/uploads/:id`

Invoices + Manual review:
- `GET /invoices`
- `POST /invoices`
- `PUT /invoices/:id`
- `DELETE /invoices/:id`
- `GET /invoices/recipients`
- `GET /invoices/export`
- `GET /invoices/media/:id`
- `GET /manual/pending`
- `GET /manual/candidates`
- `POST /manual/confirm`
- `POST /manual/reject`
- `GET /manual/candidate-invoices`
- `POST /manual/clear-all`

Subaccounts:
- `GET /subaccounts`
- `POST /subaccounts`
- `PUT /subaccounts/:id`
- `DELETE /subaccounts/:id`
- `GET /subaccounts/:id/credentials`
- `POST /subaccounts/:id/credentials/reset`
- `POST /subaccounts/:id/hard-refresh`
- `POST /subaccounts/:id/portal-access`
- `POST /subaccounts/:id/cross-debit`
- `GET /subaccounts/:subaccountId/recibos`
- `POST /subaccounts/reassign`

Finance/BI:
- `GET /position/local`
- `GET /position/remote/:id`
- `GET /positions/counters`
- `POST /positions/counters`
- `PUT /positions/counters/:id`
- `DELETE /positions/counters/:id`
- `GET /sub-customers`
- `GET /alfa-trust/transactions`
- `GET /alfa-trust/export-pdf`
- `GET /alfa-trust/export-excel`
- `POST /alfa-trust/notify-update`
- `GET /trkbit/views`
- `GET /trkbit/refresh-token`
- `GET /trkbit/transactions`
- `POST /trkbit/transactions/:uid/unlink`
- `GET /trkbit/export`

Client requests:
- `GET /client-requests`
- `PATCH /client-requests/:id/complete`
- `PATCH /client-requests/:id/amount`
- `PATCH /client-requests/:id/restore`
- `PATCH /client-requests/:id/content`

Settings/rules:
- `GET /settings/forwarding`
- `POST /settings/forwarding`
- `PUT /settings/forwarding/:id`
- `PATCH /settings/forwarding/:id/toggle`
- `PATCH /settings/forwarding/:id/toggle-reply`
- `DELETE /settings/forwarding/:id`
- `GET /settings/groups`
- `POST /settings/groups`
- `GET /direct-forwarding`
- `POST /direct-forwarding`
- `DELETE /direct-forwarding/:id`
- `GET /abbreviations`
- `POST /abbreviations`
- `PUT /abbreviations/:id`
- `DELETE /abbreviations/:id`
- `GET /request-types`
- `POST /request-types`
- `PUT /request-types/:id`
- `POST /request-types/update-order`
- `DELETE /request-types/:id`
- `GET /settings/auto-confirmation`
- `POST /settings/auto-confirmation`
- `GET /settings/alfa-api-confirmation`
- `POST /settings/alfa-api-confirmation`
- `GET /settings/troca-coin-method`
- `POST /settings/troca-coin-method`
- `GET /settings/trkbit-confirmation`
- `POST /settings/trkbit-confirmation`

Mounted sub-routers:
- `USE /usdt-wallets`
- `USE /scheduled-broadcasts`
- `USE /scheduled-withdrawals`

Deprecated endpoint:
- `GET /chave-pix` -> HTTP 410.

## 6) Integrations and Core Services

Internal service modules:
- `whatsappService`: message ingestion, queue processing, forwarding, auto-confirmation, pinning, reconciliation.
- `broadcastScheduler`: scheduled broadcast dispatch.
- `scheduledWithdrawalScheduler`: scheduled XPayz withdrawal dispatch.
- `bridgeLinkerService`: order/deposit linking for bridge partner flow.
- `auditService`: writes `audit_log`.

External systems:
- WhatsApp Web via `whatsapp-web.js`.
- XPayz API (Node + Python helper).
- Trkbit API.
- Inter/Banco API for Alfa statements (mTLS cert/key).
- TokenView + TronGrid for USDT checks.
- Telegram via Telethon.
- Google Gemini OCR for media parsing in Python path.

## 7) Database Ownership Map (Table-by-Table)

Legend:
- `Active`: referenced by current routes/services.
- `Legacy/Unused`: present but not in active runtime route flow.

- `abbreviations` -> settings + whatsapp text expansion cache. `Active`
- `alfa_transactions` -> Alfa sync + statements + matching logic. `Active`
- `audit_log` -> auth/admin/portal action logging. `Active`
- `batch_group_link` -> batch-to-group mapping for broadcast and pin. `Active`
- `bridge_transactions` -> bridge order tracking and partner confirmation. `Active`
- `broadcast_uploads` -> attachment repository for templates/schedules/pins. `Active`
- `chave_pix_keys` -> old Chave PIX CRUD controller only. `Legacy`
- `client_requests` -> extracted client requests from chat. `Active`
- `clients` -> portal credentials per subaccount (master/view-only). `Active`
- `deleted_message_ids` -> revoke/reconcile support. `Active`
- `direct_forwarding_rules` -> direct source->destination forwarding. `Active`
- `forwarded_invoices` -> forwarded invoice message linkage + confirmation state. `Active`
- `forwarding_rules` -> keyword forwarding rules. `Active`
- `group_batches` -> named broadcast/pin target sets. `Active`
- `group_settings` -> forwarding/archiving per group. `Active`
- `invoices` -> central invoice ledger and transaction linking. `Active`
- `message_templates` -> reusable broadcast templates. `Active`
- `old_invoices` -> no direct backend references. `Legacy/Unused`
- `permissions` -> RBAC permission catalog. `Active`
- `pinned_message_targets` -> per-group pin status records. `Active`
- `pinned_messages` -> pin campaign headers. `Active`
- `position_counters` -> finance dashboard counter definitions. `Active`
- `processed_messages` -> idempotency for incoming chat processing. `Active`
- `raw_message_log` -> raw message arrival ledger for reconciliation. `Active`
- `request_types` -> request-detection regex and metadata. `Active`
- `role_permissions` -> role-permission mapping. `Active`
- `roles` -> RBAC roles. `Active`
- `scheduled_broadcasts` -> recurring broadcast jobs. `Active`
- `scheduled_withdrawals` -> recurring withdrawal jobs. `Active in code/migrations; missing in provided dump`
- `subaccounts` -> account catalog (xpayz/cross) and group assignment. `Active`
- `system_settings` -> system toggles (auto confirmation, methods). `Active`
- `telegram_transactions` -> Telegram-origin transaction source. `Active`
- `trkbit_transactions` -> cross transaction source and claim/unlink flow. `Active`
- `usdt_transactions` -> USDT transaction source and matching. `Active`
- `usdt_wallets` -> monitored wallet list. `Active`
- `user_roles` -> multi-role user mapping. `Active`
- `users` -> admin users, token versioning, status. `Active`
- `whatsapp_groups` -> cached group directory. `Active`
- `whatsapp_sessions` -> no direct runtime refs in scanned JS code. `Legacy/Unclear`
- `xpayz_transactions` -> xpayz transaction source and linking. `Active`

## 8) Active vs Legacy Inventory

Active modules/pages:
- Admin panel pages mapped in `MainLayout`.
- Client portal dashboard/view-only + impersonation flow.
- RBAC (roles, permissions, user roles, token invalidation via `token_version`).
- Broadcast, scheduled broadcast, pin messages.
- Scheduled withdrawals.
- Multi-source confirmation/matching (xpayz, trkbit, usdt, alfa, telegram).

Legacy/stale artifacts:
- `frontend/src/pages/ChavePixPage.jsx` exists but not routed; backend `/api/chave-pix` now returns 410.
- `backend/controllers/chavePixController.js` exists but not mounted.
- `old_invoices` and `whatsapp_sessions` appear stale in current JS runtime paths.
- `backend/broadcastSchedulerService.js` duplicates functionality of `backend/services/broadcastScheduler.js`; server initializes only `services/broadcastScheduler.js`.
- `backend/testserver.js` debug-only.

## 9) Important Consistency Gaps

- Schema drift:
- App code depends on `scheduled_withdrawals` (controller/scheduler/migration `013_scheduled_withdrawals.sql`) but this table is absent in the provided dump.

- Route mismatch:
- Frontend portal API uses `POST /api/portal/bridge/confirm-payment` (from `portalApiClient` base), while server currently exposes `POST /portal/bridge/confirm-payment`.
- Unless a proxy rewrite exists, this call path will fail.

- Dead API wrappers in frontend:
- `portalValidateSession()` calls `/api/portal/auth/validate` but backend has no such route.
- `triggerAlfaSync()` calls `/api/alfa-trust/trigger-sync` but backend route is not present (commented legacy).

- Backend auth register handler appears non-functional:
- `authController.register` contains malformed flow (permission wrapper not applied correctly, nested function not executed), so `/api/auth/register` is likely broken.

- Dependency drift:
- Frontend imports `jwt-decode` in `PermissionContext` but `frontend/package.json` and lockfile do not declare it.

## 10) Mental Model (Condensed)

The system is an operations platform where WhatsApp is the event bus, MySQL is the source of truth, and external payment feeds (XPayz/Trkbit/USDT/Alfa/Telegram) are continuously ingested to auto-match/confirm invoice-like records. The admin SPA manages rules, entities, jobs, and confirmations. The client portal provides subaccount-centric transaction views and controlled confirmation/debit actions. RBAC is granular and enforced both in JWT payload checks and per-route permission middleware.
