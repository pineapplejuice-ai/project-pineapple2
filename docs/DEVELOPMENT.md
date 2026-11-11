# Development guide

## Commands

| Command | What it does |
| --- | --- |
| `pnpm build:packages` | Compile `shared`, `validation`, `database` (needed after changing them) |
| `pnpm dev:api` / `pnpm dev:web` | Run the API (4000) and web app (3000) with reload |
| `pnpm db:migrate` | Apply migrations (uses `packages/database/.env`) |
| `pnpm --filter @nexbill/database migrate:dev --name <name>` | Create a migration after editing `schema.prisma` |
| `pnpm db:seed` | Create a demo shop through the running API |
| `pnpm typecheck` / `pnpm test` / `pnpm e2e` | Type-check, unit + integration tests, browser tests |

Integration tests use the `nexbill_test` database; it is migrated and truncated at the start of
each run. End-to-end tests expect a built web app (`pnpm --filter @nexbill/web build && … start`)
and a running API.

## Rules that keep the system correct

1. **Reach tenant data only through `prisma.tenantTx(ctx.tenantId, tx => …)`**, and inside it use
   `tx` for every query (never `this.prisma`). Besides RLS, a second pool connection taken inside
   a transaction can exhaust the pool under concurrent billing.
2. **New tenant-owned table?** Give it a `tenantId` column and add an RLS policy in a migration
   (copy the loop in `20261111060000_rls_and_integrity`).
3. **Stock changes only through `StockService.move / moveOut`.** Never update `InventoryBalance`
   directly.
4. **Money is `Decimal`.** Use `D()` from `@nexbill/shared`; never `Number` arithmetic on amounts.
5. **Financial documents are never deleted or edited after issue.** Add a reversing document.
6. **Every mutation writes an audit entry** in the same transaction.
7. **Validate with a schema from `packages/validation`** and reuse it in the web form.
8. **Check permissions on the server** (`@Can()` or `assertCan`) and branch access
   (`assertBranchAccess` / `branchScope`).

## Adding a feature (example: a new master-data screen)

1. Model + migration (+ RLS policy) in `packages/database`.
2. Zod schema in `packages/validation`.
3. Controller methods in the relevant `apps/api/src/modules/*.ts`, registered in `app.module.ts`.
4. A page under `apps/web/src/app/(app)/…` using `ResourcePage`, and a nav entry in
   `components/shell.tsx` with its permission.
5. An integration test, including a second-tenant check.
