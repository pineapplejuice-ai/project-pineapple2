-- Defence-in-depth for tenant isolation and ledger integrity.
--
-- The API connects as the unprivileged role "nexbill_app" (not the table owner), so the policies
-- below apply to every query it runs. Each request transaction sets  app.tenant_id  with
-- set_config(..., true); without it no tenant-owned row is visible or writable.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Product_name_trgm_idx" ON "Product" USING gin ("name" gin_trgm_ops);
CREATE INDEX "Customer_name_trgm_idx" ON "Customer" USING gin ("name" gin_trgm_ops);

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId'
      -- identity/billing tables are read before a tenant context exists; they are scoped in code
      AND c.table_name NOT IN ('Session', 'Role', 'Membership', 'Subscription', 'SubscriptionInvoice')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id())', t);
  END LOOP;
END $$;

-- Append-only ledgers ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER stock_movement_immutable BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Issued financial documents can be cancelled but never deleted.
CREATE OR REPLACE FUNCTION forbid_issued_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Issued % cannot be deleted; cancel it instead', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER sales_invoice_no_delete BEFORE DELETE ON "SalesInvoice"
  FOR EACH ROW EXECUTE FUNCTION forbid_issued_delete();
CREATE TRIGGER purchase_invoice_no_delete BEFORE DELETE ON "PurchaseInvoice"
  FOR EACH ROW EXECUTE FUNCTION forbid_issued_delete();
CREATE TRIGGER payment_no_delete BEFORE DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER sales_return_no_delete BEFORE DELETE ON "SalesReturn" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Value constraints ------------------------------------------------------------------------------
ALTER TABLE "SalesInvoice"
  ADD CONSTRAINT "SalesInvoice_number_when_issued" CHECK ("status" = 'DRAFT' OR "number" IS NOT NULL),
  ADD CONSTRAINT "SalesInvoice_paid_range" CHECK ("paidAmount" >= 0 AND "paidAmount" <= "grandTotal"),
  ADD CONSTRAINT "SalesInvoice_returned_range" CHECK ("returnedAmount" >= 0 AND "returnedAmount" <= "grandTotal");
ALTER TABLE "SalesInvoiceItem"
  ADD CONSTRAINT "SalesInvoiceItem_qty_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "SalesInvoiceItem_returned_range" CHECK ("returnedQty" >= 0 AND "returnedQty" <= "quantity");
ALTER TABLE "PurchaseInvoice"
  ADD CONSTRAINT "PurchaseInvoice_paid_range" CHECK ("paidAmount" >= 0 AND "paidAmount" <= "grandTotal");
ALTER TABLE "PurchaseInvoiceItem"
  ADD CONSTRAINT "PurchaseInvoiceItem_qty_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "PurchaseInvoiceItem_returned_range" CHECK ("returnedQty" >= 0 AND "returnedQty" <= "quantity");
ALTER TABLE "PurchaseOrderItem"
  ADD CONSTRAINT "PurchaseOrderItem_received_range" CHECK ("receivedQty" >= 0 AND "receivedQty" <= "quantity");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_qty_nonneg" CHECK ("quantity" >= 0);
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_reserved_nonneg" CHECK ("reserved" >= 0);
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_distinct_wh" CHECK ("fromWarehouseId" <> "toWarehouseId");
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_factor_positive" CHECK ("factorToBase" > 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_gst_range" CHECK ("gstRate" >= 0 AND "gstRate" <= 100);

-- Public invoice share links are resolved before a tenant context exists. This definer function
-- (owned by the migration role, which owns the tables and is therefore exempt from RLS) exposes
-- only the two ids for an exact, unguessable token.
CREATE OR REPLACE FUNCTION resolve_share_token(token text)
RETURNS TABLE (tenant_id uuid, invoice_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT "tenantId", "id" FROM "SalesInvoice" WHERE "shareToken" = token AND "status" <> 'DRAFT'
$$;

-- Privileges for the application role (created outside migrations; see infrastructure/docker/initdb).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexbill_app') THEN
    GRANT USAGE ON SCHEMA public TO nexbill_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexbill_app;
    REVOKE ALL ON "_prisma_migrations" FROM nexbill_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexbill_app;
  END IF;
END $$;
