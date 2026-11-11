# Status against the build brief

Legend: **Done** = implemented and covered by automated tests or exercised end to end in a
browser. **Partial** = works but narrower than the brief. **Not built** = absent.

The brief arrived cut off part-way through section 27 (performance); anything after that point
was not seen.

Verified in this build: 22 unit tests, 28 API integration tests against PostgreSQL, 10 Playwright
browser tests, production build of the web app. **Not verified:** the Dockerfiles, compose file
and GitHub Actions workflow (no Docker daemon or CI runner was available), and any real printer,
scanner or payment/SMS/email provider.

## 2–3. Architecture and multi-tenancy

| Item | Status |
| --- | --- |
| pnpm monorepo, Next.js + NestJS + PostgreSQL + Prisma, strict TypeScript, Swagger | Done |
| Tailwind, React Hook Form, Zod, TanStack Query, Zustand, Lucide | Done |
| shadcn/ui | Partial – hand-written primitives in the same style, not the generated library |
| `packages/ui`, `packages/config` | Not built – UI lives in `apps/web`, config in `tsconfig.base.json` |
| Redis, BullMQ, S3 storage | Not built – nothing implemented needs them yet |
| Tenant registration, several businesses per tenant, branches, warehouses | Done |
| Tenant-specific GSTIN, numbering, financial year, settings, users, roles | Done |
| Tenant resolved server-side; PostgreSQL row-level security on 41 tables | Done (tested) |
| Plans, limits, feature gating, trial, upgrade/downgrade, lapsed = read-only | Done (tested) |
| Tenant audit log | Done |
| Invoice branding | Partial – logo URL, terms and three layouts; no template designer |

## 4. Authentication and access control

| Item | Status |
| --- | --- |
| Register, login, logout, refresh rotation with reuse detection, sessions list/revoke | Done (tested) |
| Password reset, email verification | Partial – flows work; emails are only logged (no mail provider) |
| Eight business roles with granular permissions, custom roles, branch restrictions | Done (tested) |
| SaaS super admin | Not built – only an `isPlatformAdmin` flag exists, no admin console |
| Google sign-in, two-factor authentication | Not built |

## 5. Onboarding

Done: account → business details → industry → GST → invoice preferences → first products →
supplier → first invoice (covered by the browser test). Decimal precision is fixed (2 for money,
up to 4 for quantity) rather than configurable.

## 6. Products and catalogue

| Item | Status |
| --- | --- |
| Product fields, categories/sub-categories, brand, HSN, GST, prices, min stock, reorder level | Done |
| Variants, multiple barcodes, per-product alternate units with conversion | Done |
| Search, filters, duplicate-name detection, CSV import (create), CSV export | Done |
| Bundles / composite products | Partial – API and stock deduction work; no screen to build a bundle |
| Bulk update, Excel (.xlsx) files | Not built – CSV only, import creates but does not update |
| Product images | Partial – image URL field; no upload |
| Industry attributes (steel, flavours, etc.) as configuration | Done – attribute definitions per industry profile |
| Batches, expiry, FEFO | Done (tested) |
| Variable-weight barcodes (scale labels), offers/promotions | Not built |
| Global unit conversions (kg ↔ g) | Not built – table exists; use per-product alternate units |
| Wholesale price | Partial – stored per product; not applied automatically to wholesale customers |

## 7–8. POS, billing and GST

| Item | Status |
| --- | --- |
| Instant search, barcode scanner, keyboard-only billing, quantity prefix (`3*code`) | Done (browser-tested) |
| Units, item and bill discounts, price override by permission, round-off | Done (tested) |
| Walk-in and named customers; cash, UPI, card, bank; split payments; credit sales | Done (tested) |
| Hold/resume (on the device), server-side drafts | Done; drafts can be viewed/discarded but not reopened into the POS (API supports it) |
| Print (A4, 80 mm, 58 mm via browser), PDF via "Save as PDF", reprint | Done |
| WhatsApp share link, public invoice page | Done |
| Email invoice | Partial – request accepted and logged; no mail provider |
| Inclusive/exclusive tax, CGST/SGST/IGST, cess, exempt, mixed rates, place of supply, HSN summary | Done (unit-tested) |
| Tax invoice, bill of supply, credit notes (sales returns), debit notes (purchase returns) | Done |
| Standalone credit/debit notes (e.g. price revisions) | Not built |
| Sequential, concurrency-safe, gapless numbering; no deletion of issued invoices | Done (tested with 25 concurrent bills) |
| GSTIN validation with checksum | Done |
| Sales/purchase registers, tax summary, HSN summary, GSTR-1 and GSTR-3B preparation, CSV export | Done – **preparation data only, needs professional review** |
| E-invoice (IRN/QR), e-way bill | Not built – no provider integration and no placeholder IRNs |

## 9. Inventory

Done (tested): opening stock, inward/outward, transfers with reservation and approval,
adjustments, damage, wastage, returns, batches and expiry, low-stock alerts, warehouse and branch
stock, physical stock count, moving-average valuation, immutable movement history, safe concurrent
sales. Partial: reservations exist only for transfers; expiry is visible on the Batches tab but no
scheduled expiry notifications are sent.

## 10–12. Purchases, customers, returns

| Item | Status |
| --- | --- |
| Suppliers, PO, partial GRN, bill from GRN or direct, purchase returns, supplier payments, ledger | Done (tested) |
| Purchase price history | Partial – visible through bills and the stock ledger; no dedicated report |
| Customers, credit limit/period, balances, partial and advance payments, ledger, statement | Done (tested) |
| Payment reminders | Not built |
| Full/partial/item returns, refunds, credit notes, stock restoration, damaged returns | Done (tested, incl. duplicate and concurrent returns) |
| Exchange | Partial – do a return, then a new bill; no single combined screen |

## 13–14. Expenses, reports, dashboard

Done: expense categories and entries (void instead of delete), cash register open/close with
expected-vs-counted reconciliation, payment modes; reports for sales (daily/weekly/monthly/annual),
gross profit, estimated net profit, cash movement, purchases, expenses, tax, receivables, payables,
stock valuation, fast/slow/dead stock, payment modes, branch comparison; dashboard with date ranges
and charts, all computed from database rows (reconciled in a test). Reporting uses Indian Standard
Time for day boundaries.

## 15–17. Branches, hardware module, printing

| Item | Status |
| --- | --- |
| Branches, warehouses, inter-branch transfers with approval, branch stock, users and reports | Done |
| Branch-specific pricing | Partial – API endpoint and POS lookup work; no screen to set prices |
| Steel attributes, theoretical weight calculator (SHS, RHS, pipe, angle, flat, channel, sheet), piece ↔ length units | Done |
| Cut-length offcut register, actual-vs-theoretical weight, physical vs commercial quantity | Not built (a `cutPlan` helper exists, unused) |
| Browser printing for thermal and A4, keyboard-wedge barcode scanners | Done |
| Print bridge for raw ESC/POS, cash drawer, weighing scales, label printers | Not built – described under Integrations |

## 18. Offline

Partial. Installable PWA manifest, service worker for the app shell (production builds), cached
catalogue, offline bill queue with idempotency keys, network indicator, automatic retry and a
review list for rejected bills. Server-side idempotency is tested (retries and concurrent
duplicates create exactly one invoice). **The browser-side offline queue and sync are not covered
by automated tests, so offline billing should not be described as reliable yet.**

## 19–20. Subscription and notifications

| Item | Status |
| --- | --- |
| Plans, trial, upgrade now, downgrade at renewal, limits, usage, subscription invoices | Done |
| Payment gateway | Partial – adapter interface with a test gateway that always succeeds |
| Automatic renewal, expiry and grace processing | Not built – needs a scheduled job |
| In-app notifications: low stock, payment received | Done |
| Other notifications; email, SMS, WhatsApp delivery | Not built – adapter interfaces with a logging implementation |

## 21–22. Design and modules

Done: light/dark themes, collapsible sidebar, global search (Ctrl K), business and branch
switchers, notifications, breadcrumbs, loading/empty/error states, confirmations, toasts,
permission-aware navigation, responsive layouts. All 21 navigation modules have working screens.

## 23–27. Security, audit, testing, database, performance

See [SECURITY.md](SECURITY.md). Done: validation, parameterised SQL, rate limiting, secure
cookies, Argon2id, RLS, RBAC, audit log, transactions, indexes, server-side pagination and
filtering, health check, structured logs with request ids. Not built: Content-Security-Policy,
caching, background jobs, error-monitoring integration, load testing.
