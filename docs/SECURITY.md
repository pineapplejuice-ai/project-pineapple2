# Security model

## Authentication

- Passwords hashed with **Argon2id**. Five failed logins lock the account for 15 minutes.
- Access token: HS256 JWT, 15 minutes, kept in browser memory only.
- Refresh token: 48 random bytes, stored hashed, delivered as an `httpOnly`, `SameSite=Lax`
  (and `Secure` in production) cookie. **Rotated on every use**; presenting an already-rotated
  token revokes the whole session (theft detection).
- Cookie-authenticated endpoints require the custom header `x-nexbill-csrf`, which browsers will
  not attach cross-site without CORS approval. All other endpoints use the bearer token.
- Password reset and email verification use single-use, hashed, expiring tokens. Reset signs out
  every session. Forgot-password responses do not reveal whether an email exists.
- Not built: Google sign-in, two-factor authentication.

## Authorisation

- Permissions are checked **on the server** by a global guard (`@Can(...)`) and inside services
  for conditional rules (price override, discounts, cost visibility). The UI hiding a button is
  only a convenience.
- Roles are per tenant. Nobody can grant a permission they do not hold; the owner role cannot be
  assigned or edited; members cannot change their own access.
- Members can be restricted to branches. Billing, sales lists and invoices, payments, expenses,
  cash register, stock operations and reports honour this. Purchase documents, customers, suppliers
  and the catalogue are shared across the business (see STATUS.md).

## Tenant isolation

Two independent layers (see ARCHITECTURE.md): tenant resolved server-side from the session, and
PostgreSQL row-level security on every tenant-owned table. For RLS to hold, the API **must**
connect as `nexbill_app` (not the table owner, not a superuser).

## Data integrity

- Database triggers make the stock ledger and audit log append-only and block deletion of issued
  invoices, payments and returns. CHECK constraints bound paid/returned amounts and quantities.
- Client-supplied totals are ignored. Prices other than the catalogue price need a permission.
- Audit log records actor, tenant, action, entity, time and before/after values for invoices,
  cancellations, returns, price changes, stock changes, credit changes, payments, staff and
  settings changes.

## Platform hardening

- Input validation with Zod on every body and query; unknown routes and malformed ids return 4xx.
- Prisma parameterises all SQL, including the hand-written queries (tagged templates).
- React escapes output; no `dangerouslySetInnerHTML`. CSV exports neutralise formula injection.
- `helmet` headers on the API; frame, sniffing and referrer headers on the web app.
- Rate limiting: global and stricter on auth routes (in-memory, per API instance).
- Errors return a consistent envelope with a request id; stack traces stay in server logs.
- Secrets come only from the environment; the API will not start in production with a weak
  `JWT_SECRET`. Nothing secret is shipped to the browser.

## Known gaps (to close before production)

- No Content-Security-Policy on the web app yet.
- Rate limiting is per instance; use Redis-backed storage when running more than one API replica.
- No file uploads exist yet, so no upload scanning (logo and product images are URLs).
- `pnpm audit` runs in CI as a non-blocking step; add Dependabot/Renovate and make it blocking.
- No external penetration test has been performed.

## Backup and recovery (recommended)

- Continuous WAL archiving for point-in-time recovery, plus a nightly `pg_dump` stored encrypted in
  a different region/account. Retain 30 daily and 12 monthly copies.
- Restore drill at least quarterly: restore to a scratch instance, run `prisma migrate status`,
  and reconcile `SUM(StockMovement.quantity)` against `InventoryBalance` per variant.
- The append-only ledgers mean a tenant's balances can always be recomputed from movements.
