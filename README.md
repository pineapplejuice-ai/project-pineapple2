# NEXBILL

Multi-tenant billing, POS, inventory and GST software for Indian retail and wholesale businesses
(hardware, grocery, ice cream, electrical, sanitaryware, distribution and general retail).

This repository is a working application, not a mock-up: a NestJS API with PostgreSQL storage,
server-side tax and stock logic, authentication, role-based permissions and tenant isolation, plus
a Next.js web app that runs on desktop, tablet and phone.

> **Read [docs/STATUS.md](docs/STATUS.md) before relying on anything.** It lists, requirement by
> requirement, what is built and tested, what is partial and what is not built. GST logic must be
> reviewed by a qualified professional before commercial use, and NEXBILL does not file returns or
> generate IRNs / e-way bills.

## What is in the box

| Area | Summary |
| --- | --- |
| POS / billing | Keyboard-first counter screen, barcode scanning, alternate units, item and bill discounts, split payments, credit sales, hold/resume, drafts, offline queue |
| GST invoicing | CGST/SGST/IGST by place of supply, tax-inclusive and exclusive prices, cess, exempt items, bill of supply, credit and debit notes, GSTR-1 / GSTR-3B preparation reports |
| Inventory | Append-only stock ledger, per-warehouse balances, batches with FEFO and expiry, adjustments, stock counts, transfers with reservation and approval, low-stock alerts |
| Purchasing | Suppliers, purchase orders, partial goods receipts, purchase bills, purchase returns, supplier payments and ledgers, moving-average cost |
| Customers | Credit limits and periods, partial and on-account payments, advances, statements |
| Money | Expenses, cash register open/close with reconciliation, payments register |
| Reports | Sales, profit (gross vs estimated net vs cash), stock valuation, slow/dead stock, receivables, payables, branch comparison, CSV export |
| SaaS | Tenants, multiple businesses, branches and warehouses, roles and granular permissions, plans with limits and feature gating, audit log |

## Repository layout

```
apps/api            NestJS REST API (modular monolith)          → docs at /api/docs
apps/web            Next.js App Router web app / PWA
packages/shared     Pure domain logic: GST engine, GSTIN, units, steel weights, permissions, plans
packages/validation Zod schemas shared by the API and the web forms
packages/database   Prisma schema, SQL migrations (incl. row-level security)
infrastructure/     Dockerfiles, Postgres init script, deployment notes
scripts/            Demo data seeder
docs/               Architecture, security, development guide, status
```

## Quick start (local)

Requirements: Node 20+, pnpm 10, PostgreSQL 16.

```bash
pnpm install

# 1. database: an owner role for migrations and an unprivileged role for the API (needed for RLS)
psql -U postgres -c "CREATE ROLE nexbill_owner LOGIN PASSWORD 'nexbill' CREATEDB" \
                 -c "CREATE ROLE nexbill_app LOGIN PASSWORD 'nexbill_app'" \
                 -c "CREATE DATABASE nexbill OWNER nexbill_owner" \
                 -c "CREATE DATABASE nexbill_test OWNER nexbill_owner"
cp .env.example packages/database/.env        # keep the two DATABASE_* lines

# 2. build shared packages and migrate
pnpm build:packages
pnpm db:migrate

# 3. run
pnpm dev:api          # http://localhost:4000  (Swagger: /api/docs)
pnpm dev:web          # http://localhost:3000

# optional: a demo hardware shop with three weeks of data (prints the login)
pnpm db:seed
```

Docker: `cp .env.example .env`, set the secrets, then `docker compose up --build`.
(The Docker files and the CI workflow were written but could not be executed in the environment
this was built in; treat them as untested until they have run once.)

## Tests

```bash
pnpm test     # 22 unit tests (tax engine etc.) + 28 API integration tests against PostgreSQL
pnpm e2e      # 10 Playwright browser tests (API and web must be running)
```

The integration suite covers authentication, two-tenant isolation (including PostgreSQL row-level
security with application filters deliberately bypassed), permissions, invoice maths, concurrent
billing, idempotent retries, purchases, payments, returns, cancellations and report reconciliation.

## Documentation

- [docs/STATUS.md](docs/STATUS.md) – what is done, partial and missing
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – structure, data model and key design decisions
- [docs/SECURITY.md](docs/SECURITY.md) – security model, tenant isolation, backups
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) – conventions, adding a module, testing
- [infrastructure/deployment/README.md](infrastructure/deployment/README.md) – production checklist
