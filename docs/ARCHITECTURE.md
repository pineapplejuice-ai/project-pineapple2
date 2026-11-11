# Architecture

## Shape

A **modular monolith** in a pnpm workspace. One API process, one web process, one PostgreSQL
database. No microservices, queues or caches are deployed because nothing built so far needs them.

```
browser ──► Next.js (apps/web) ──/api/* proxy──► NestJS (apps/api) ──► PostgreSQL
                    │                                   │
                    └──────── packages/validation ──────┤   same Zod schemas on both sides
                              packages/shared ──────────┘   same GST engine on both sides
```

- `packages/shared` is pure TypeScript with no I/O. The GST calculator (`computeInvoice`) runs in
  the POS for a live preview and on the server as the only source of truth; the client never sends
  totals.
- `packages/validation` holds the Zod schemas. The API validates every body and query with them,
  the web forms use the same schemas through React Hook Form, and the OpenAPI document is generated
  from them.
- `apps/api/src/common` is infrastructure (Prisma, auth guard, validation pipe, error filter,
  audit, sequences). `apps/api/src/modules/*` are the business areas; each file exposes services
  that other modules call, so an area can be extracted later without rewriting callers.

## Tenancy

```
User ──< Membership >── Tenant ──< Business ──< Branch ──< Warehouse
                 │
                Role (permissions[])        Subscription (per tenant)
```

- A **tenant** is the paying account. It can hold several businesses (each with its own GSTIN,
  settings, numbering and catalogue), each business has branches, each branch has warehouses.
- The tenant is resolved from the signed access token plus a live membership lookup on every
  request. The only client-chosen scope is the business (`x-business-id` header), and it is
  verified to belong to that tenant.
- **Every** query on tenant-owned tables runs inside `PrismaService.tenantTx()`, which opens a
  transaction and sets `app.tenant_id`. PostgreSQL row-level security policies (41 tables) compare
  `tenantId` with that setting, and the API connects as a role that does not own the tables, so a
  query that forgets its filter still cannot cross tenants. This is exercised by a test that runs
  unfiltered queries and cross-tenant writes directly against the database.
- Identity tables (`User`, `Session`, `Membership`, `Role`, `Subscription`) are needed before a
  tenant context exists and are scoped in code instead.

## Money and tax

- All money is `Decimal` end to end: `Decimal(14,2)` columns, `decimal.js` in code, strings in
  JSON. No floats.
- Per line: discount → (back-compute taxable value for inclusive prices) → CGST = SGST =
  round(taxable × rate / 2) for intra-state, IGST for inter-state → cess. Totals are sums of the
  rounded lines; the grand total is rounded to the rupee and the difference is stored as round-off.
- Place of supply = explicit value, else the customer's state, else GSTIN prefix, else the
  business state. An unregistered business issues a bill of supply with no tax.

## Document numbers

`DocumentSequence(businessId, docType, fy)` is incremented with a single
`INSERT … ON CONFLICT DO UPDATE … RETURNING` inside the document's transaction. The row lock makes
concurrent writers queue; a rollback releases the number, so numbers are unique and gapless per
financial year. Format `PREFIX/YY-YY/0001` fits GST's 16-character limit. Drafts have no number.

## Inventory

- `InventoryBalance(warehouse, variant)` holds the quantity; `StockMovement` is an append-only
  ledger (a database trigger rejects UPDATE and DELETE) with type, signed quantity, resulting
  balance, source document, user and time.
- `StockService.move()` is the only code that changes stock: one atomic upsert-and-return on the
  balance row, a check against available quantity (on hand minus reserved), then the ledger row.
  Concurrent bills serialise on the row lock, so stock cannot be oversold; lines are processed in
  variant-id order to avoid deadlocks.
- Batches are consumed first-expiry-first-out unless a batch is chosen. Cost is a moving average
  updated on every inward movement; each invoice line stores the cost at the time of sale, which
  is what gross profit is computed from.

## Sales lifecycle

```
DRAFT ──issue──► ISSUED ──cancel──► CANCELLED         (never deleted; triggers block it)
                   │
                   └── returns ──► credit notes (CN/…), stock restored or written off, refunds
```

Issuing an invoice writes, in one transaction: number, header and lines, stock movements, payment
rows and allocations, customer balance, audit entry. Creation accepts an idempotency key (unique
per tenant) so a retried or duplicated request returns the original invoice.

## Frontend

Next.js App Router, client components with TanStack Query for server state and Zustand for the
session and the POS cart. The access token lives in memory; the refresh token is an httpOnly
cookie, and the browser only ever talks to its own origin. UI primitives are small hand-written
components in the shadcn/ui style (`apps/web/src/components/ui`). Simple master-data screens are
generated from a schema plus a field list by `ResourcePage`.

Offline: the POS keeps a local copy of the catalogue and queues bills it cannot send. Each queued
bill carries an idempotency key and is posted when the connection returns; server-side rejections
(for example stock sold elsewhere) are kept for the user to review.
