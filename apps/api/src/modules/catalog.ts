import { BadRequestException, ConflictException, Controller, Delete, Get, Header, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@nexbill/database';
import { D } from '@nexbill/shared';
import { branchPriceSchema, categorySchema, listQuery, productImportSchema, productSchema, unitSchema, type ListQuery, type ProductInput } from '@nexbill/validation';
import type { z } from 'zod';
import { AuditService } from '../common/core.services';
import { Can, Ctx, CurrentCtx } from '../common/context';
import { page, skipTake, toCsv } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { ApiZod, ZBody, ZQuery } from '../common/zod';
import { StockService } from './inventory';

const productInclude = {
  category: { select: { id: true, name: true } }, baseUnit: true,
  units: { include: { unit: true } },
  variants: { include: { barcodes: true, bundleItems: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class CatalogService {
  constructor(private readonly stock: StockService, private readonly audit: AuditService) {}

  private async nextSku(tx: Tx, ctx: Ctx): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ n: number }>>`
      INSERT INTO "DocumentSequence" ("id", "tenantId", "businessId", "docType", "fy", "prefix", "nextNumber")
      VALUES (gen_random_uuid(), ${ctx.tenantId}::uuid, ${ctx.businessId}::uuid, 'SKU', 'ALL', 'P', 2)
      ON CONFLICT ("businessId", "docType", "fy") DO UPDATE SET "nextNumber" = "DocumentSequence"."nextNumber" + 1
      RETURNING "nextNumber" - 1 AS n`;
    return `P${String(rows[0]!.n).padStart(5, '0')}`;
  }

  private async assertRefs(tx: Tx, ctx: Ctx, input: ProductInput): Promise<void> {
    const b = ctx.businessId;
    const unitIds = [input.baseUnitId, ...input.units.map((u) => u.unitId)];
    if ((await tx.unit.count({ where: { id: { in: unitIds }, businessId: b } })) !== new Set(unitIds).size) throw new BadRequestException('Unknown unit');
    if (input.units.some((u) => u.unitId === input.baseUnitId)) throw new BadRequestException('The base unit cannot also be an alternate unit');
    if (input.categoryId && !(await tx.category.findFirst({ where: { id: input.categoryId, businessId: b } }))) throw new BadRequestException('Unknown category');
    if (input.supplierId && !(await tx.supplier.findFirst({ where: { id: input.supplierId, businessId: b } }))) throw new BadRequestException('Unknown supplier');
    if (input.type === 'BUNDLE') {
      if (input.bundleItems.length === 0) throw new BadRequestException('A bundle needs at least one component');
      const ids = input.bundleItems.map((i) => i.componentVariantId);
      const comps = await tx.productVariant.findMany({ where: { id: { in: ids }, businessId: b }, select: { product: { select: { type: true } } } });
      if (comps.length !== new Set(ids).size || comps.some((c) => c.product.type === 'BUNDLE')) throw new BadRequestException('Bundle components must be ordinary products');
    }
  }

  async create(tx: Tx, ctx: Ctx, input: ProductInput, allowDuplicate: boolean) {
    await this.assertRefs(tx, ctx, input);
    if (!allowDuplicate) {
      const dup = await tx.product.findFirst({ where: { businessId: ctx.businessId, name: { equals: input.name, mode: 'insensitive' } }, select: { id: true } });
      if (dup) throw new ConflictException({ message: `A product named "${input.name}" already exists`, code: 'DUPLICATE_PRODUCT', productId: dup.id });
    }
    const { variants, units, bundleItems, warehouseId, ...fields } = input;
    const product = await tx.product.create({
      data: { tenantId: ctx.tenantId, businessId: ctx.businessId, ...fields,
        units: { create: units.map((u) => ({ tenantId: ctx.tenantId, ...u })) } },
    });
    const openingWh = variants.some((v) => v.openingStock && Number(v.openingStock) > 0)
      ? warehouseId ? await this.stock.warehouse(tx, ctx, warehouseId) : await tx.warehouse.findFirstOrThrow({ where: { businessId: ctx.businessId, isDefault: true } })
      : null;
    for (const [idx, v] of variants.entries()) {
      const variant = await this.saveVariant(tx, ctx, product.id, v, null);
      if (idx === 0 && input.type === 'BUNDLE')
        await tx.bundleItem.createMany({ data: bundleItems.map((bi) => ({ tenantId: ctx.tenantId, bundleVariantId: variant.id, ...bi })) });
      if (openingWh && v.openingStock && Number(v.openingStock) > 0 && input.trackInventory && input.type === 'GOODS') {
        const batchId = input.trackBatches && v.openingBatchNo
          ? await this.stock.ensureBatch(tx, ctx, { warehouseId: openingWh.id, variantId: variant.id, batchNo: v.openingBatchNo, expiryDate: v.openingExpiry, costPrice: v.purchasePrice }) : null;
        await this.stock.move(tx, ctx, { warehouseId: openingWh.id, variantId: variant.id, quantity: v.openingStock, type: 'OPENING', refType: 'PRODUCT', refId: product.id, unitCost: v.purchasePrice, batchId, note: 'Opening stock' });
      }
    }
    await this.audit.log(tx, ctx, 'product.create', 'Product', product.id, { summary: product.name });
    return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude });
  }

  private async saveVariant(tx: Tx, ctx: Ctx, productId: string, v: ProductInput['variants'][number], existingId: string | null) {
    const data = {
      name: v.name, productCode: v.productCode, purchasePrice: v.purchasePrice, sellingPrice: v.sellingPrice, mrp: v.mrp ?? null,
      wholesalePrice: v.wholesalePrice ?? null, minStock: v.minStock, reorderLevel: v.reorderLevel, attributes: v.attributes, isActive: v.isActive,
    };
    if (v.mrp != null && D(v.sellingPrice).gt(D(v.mrp))) throw new BadRequestException('Selling price cannot be more than MRP');
    const variant = existingId
      ? await tx.productVariant.update({ where: { id: existingId }, data: { ...data, ...(v.sku ? { sku: v.sku } : {}) } })
      : await tx.productVariant.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, productId, sku: v.sku || (await this.nextSku(tx, ctx)), avgCost: v.purchasePrice, ...data } });
    await tx.barcode.deleteMany({ where: { variantId: variant.id, code: { notIn: v.barcodes } } });
    await tx.barcode.createMany({ data: v.barcodes.map((code) => ({ tenantId: ctx.tenantId, businessId: ctx.businessId, variantId: variant.id, code })), skipDuplicates: true });
    if ((await tx.barcode.count({ where: { variantId: variant.id } })) !== new Set(v.barcodes).size) throw new ConflictException('One of the barcodes is already used by another product');
    return variant;
  }

  async update(tx: Tx, ctx: Ctx, id: string, input: ProductInput) {
    const before = await tx.product.findFirst({ where: { id, businessId: ctx.businessId }, include: { variants: true } });
    if (!before) throw new NotFoundException('Product not found');
    await this.assertRefs(tx, ctx, input);
    if (before.baseUnitId !== input.baseUnitId && (await tx.stockMovement.count({ where: { variantId: { in: before.variants.map((v) => v.id) } } })) > 0)
      throw new BadRequestException('The base unit cannot be changed once the product has stock movements');
    const { variants, units, bundleItems, warehouseId: _w, ...fields } = input;
    await tx.product.update({ where: { id }, data: fields });
    await tx.productUnit.deleteMany({ where: { productId: id } });
    await tx.productUnit.createMany({ data: units.map((u) => ({ tenantId: ctx.tenantId, productId: id, ...u })) });
    const keep = new Set<string>();
    const priceChanges: Array<Record<string, string>> = [];
    for (const v of variants) {
      const existing = v.id ? before.variants.find((x) => x.id === v.id) : undefined;
      if (v.id && !existing) throw new BadRequestException('Unknown variant');
      const saved = await this.saveVariant(tx, ctx, id, v, existing?.id ?? null);
      keep.add(saved.id);
      if (existing && (!D(existing.sellingPrice.toString()).eq(D(v.sellingPrice)) || !D(existing.purchasePrice.toString()).eq(D(v.purchasePrice))))
        priceChanges.push({ sku: saved.sku, sellingFrom: existing.sellingPrice.toString(), sellingTo: String(v.sellingPrice), purchaseFrom: existing.purchasePrice.toString(), purchaseTo: String(v.purchasePrice) });
    }
    // variants are never deleted (they may be on invoices); dropping one from the form deactivates it
    await tx.productVariant.updateMany({ where: { productId: id, id: { notIn: [...keep] } }, data: { isActive: false } });
    if (input.type === 'BUNDLE') {
      const first = [...keep][0]!;
      await tx.bundleItem.deleteMany({ where: { bundleVariantId: first } });
      await tx.bundleItem.createMany({ data: bundleItems.map((bi) => ({ tenantId: ctx.tenantId, bundleVariantId: first, ...bi })) });
    }
    if (priceChanges.length) await this.audit.log(tx, ctx, 'product.price_change', 'Product', id, { summary: before.name, after: priceChanges });
    await this.audit.log(tx, ctx, 'product.update', 'Product', id, { summary: input.name });
    return tx.product.findUniqueOrThrow({ where: { id }, include: productInclude });
  }
}

type AnyRec = Record<string, unknown>;
const hideCost = <T extends AnyRec>(ctx: Ctx, variant: T): T =>
  ctx.permissions.includes('products.view_cost') ? variant : { ...variant, purchasePrice: null, avgCost: null };

@ApiTags('catalog') @ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService, private readonly catalog: CatalogService, private readonly audit: AuditService) {}

  /* ── categories & units ── */
  @Get('categories') @Can('products.view')
  categories(@CurrentCtx() ctx: Ctx) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.category.findMany({ where: { businessId: ctx.businessId }, include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } }));
  }
  @Post('categories') @Can('products.manage') @ApiZod(categorySchema)
  createCategory(@CurrentCtx() ctx: Ctx, @ZBody(categorySchema) body: z.infer<typeof categorySchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      if (body.parentId && !(await tx.category.findFirst({ where: { id: body.parentId, businessId: ctx.businessId } }))) throw new BadRequestException('Unknown parent category');
      if (await tx.category.findFirst({ where: { businessId: ctx.businessId, parentId: body.parentId ?? null, name: { equals: body.name, mode: 'insensitive' } } })) throw new ConflictException('This category already exists');
      return tx.category.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, name: body.name, parentId: body.parentId ?? null } });
    });
  }
  @Put('categories/:id') @Can('products.manage') @ApiZod(categorySchema)
  updateCategory(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(categorySchema) body: z.infer<typeof categorySchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      if (!(await tx.category.findFirst({ where: { id, businessId: ctx.businessId } }))) throw new NotFoundException('Category not found');
      if (body.parentId === id) throw new BadRequestException('A category cannot be its own parent');
      return tx.category.update({ where: { id }, data: { name: body.name, parentId: body.parentId ?? null } });
    });
  }
  @Delete('categories/:id') @Can('products.manage')
  deleteCategory(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const c = await tx.category.findFirst({ where: { id, businessId: ctx.businessId }, include: { _count: { select: { products: true, children: true } } } });
      if (!c) throw new NotFoundException('Category not found');
      if (c._count.products || c._count.children) throw new ConflictException('Move its products and sub-categories first');
      await tx.category.delete({ where: { id } });
      return { ok: true };
    });
  }
  @Get('units') @Can('products.view')
  units(@CurrentCtx() ctx: Ctx) { return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.unit.findMany({ where: { businessId: ctx.businessId }, orderBy: { code: 'asc' } })); }
  @Post('units') @Can('products.manage') @ApiZod(unitSchema)
  createUnit(@CurrentCtx() ctx: Ctx, @ZBody(unitSchema) body: z.infer<typeof unitSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.unit.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, ...body } }));
  }

  /* ── products ── */
  @Get('products') @Can('products.view')
  list(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery, @Query('categoryId') categoryId?: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where: Prisma.ProductWhereInput = {
        businessId: ctx.businessId, categoryId: categoryId || undefined,
        isActive: q.status === 'inactive' ? false : q.status === 'all' ? undefined : true,
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { brand: { contains: q.q, mode: 'insensitive' } }, { hsnCode: { startsWith: q.q } },
          { variants: { some: { OR: [{ sku: { contains: q.q, mode: 'insensitive' } }, { barcodes: { some: { code: q.q } } }] } } }] } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.product.findMany({ where, include: { category: { select: { name: true } }, baseUnit: { select: { code: true } }, variants: { include: { balances: { select: { quantity: true } } } } }, orderBy: { name: 'asc' }, ...skipTake(q) }),
        tx.product.count({ where }),
      ]);
      return page(rows.map((p) => ({ ...p, variants: p.variants.map(({ balances, ...v }) => hideCost(ctx, { ...v, stock: balances.reduce((a, b) => a.plus(D(b.quantity.toString())), D(0)).toString() })) })), total, q);
    });
  }

  @Get('products/export') @Can('products.view', 'reports.export') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="products.csv"')
  export(@CurrentCtx() ctx: Ctx) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const rows = await tx.productVariant.findMany({ where: { businessId: ctx.businessId }, include: { product: { include: { category: true, baseUnit: true } }, barcodes: true, balances: true }, orderBy: { sku: 'asc' }, take: 20000 });
      const cost = ctx.permissions.includes('products.view_cost');
      return toCsv(rows.map((v) => ({
        name: v.product.name, variant: v.name, sku: v.sku, barcode: v.barcodes[0]?.code ?? '', category: v.product.category?.name ?? '', unit: v.product.baseUnit.code,
        hsnCode: v.product.hsnCode ?? '', gstRate: v.product.gstRate, purchasePrice: cost ? v.purchasePrice : '', sellingPrice: v.sellingPrice, mrp: v.mrp ?? '',
        stock: v.balances.reduce((a, b) => a.plus(D(b.quantity.toString())), D(0)).toString(), active: v.isActive && v.product.isActive,
      })));
    });
  }

  /**
   * POS lookup. One query returns flat, sellable variants with warehouse stock, branch price and
   * alternate units. An exact barcode or SKU match is ranked first so scanner input adds instantly.
   */
  @Get('catalog/sellable') @Can('products.view')
  sellable(@CurrentCtx() ctx: Ctx, @Query('q') q = '', @Query('warehouseId') warehouseId?: string, @Query('branchId') branchId?: string, @Query('limit') limit = '20') {
    const term = q.trim().slice(0, 100);
    const take = Math.min(Math.max(Number(limit) || 20, 1), 5000);
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const exact = term ? await tx.productVariant.findMany({ where: { businessId: ctx.businessId, isActive: true, product: { isActive: true }, OR: [{ barcodes: { some: { code: term } } }, { sku: { equals: term, mode: 'insensitive' } }] }, select: { id: true }, take: 5 }) : [];
      const fuzzy = await tx.productVariant.findMany({
        where: { businessId: ctx.businessId, isActive: true, id: { notIn: exact.map((e) => e.id) }, product: { isActive: true },
          ...(term ? { OR: [{ product: { name: { contains: term, mode: 'insensitive' } } }, { name: { contains: term, mode: 'insensitive' } }, { sku: { contains: term, mode: 'insensitive' } }, { productCode: { contains: term, mode: 'insensitive' } }] } : {}) },
        select: { id: true }, orderBy: { product: { name: 'asc' } }, take: take - exact.length,
      });
      const ids = [...exact, ...fuzzy].map((x) => x.id);
      const variants = await tx.productVariant.findMany({
        where: { id: { in: ids } },
        include: { barcodes: { select: { code: true } }, product: { include: { baseUnit: true, units: { include: { unit: true } } } },
          balances: { where: warehouseId ? { warehouseId } : undefined, select: { quantity: true, reserved: true } },
          branchPrices: { where: { branchId: branchId ?? '00000000-0000-0000-0000-000000000000' } } },
      });
      const byId = new Map(variants.map((v) => [v.id, v]));
      return ids.map((id) => byId.get(id)!).map((v) => hideCost(ctx, {
        variantId: v.id, productId: v.productId, name: v.name ? `${v.product.name} – ${v.name}` : v.product.name, sku: v.sku, barcodes: v.barcodes.map((b) => b.code),
        type: v.product.type, hsnCode: v.product.hsnCode, gstRate: v.product.gstRate, cessRate: v.product.cessRate, taxExempt: v.product.taxExempt,
        priceIncludesTax: v.product.priceIncludesTax, sellingPrice: v.branchPrices[0]?.sellingPrice ?? v.sellingPrice, mrp: v.mrp, wholesalePrice: v.wholesalePrice,
        purchasePrice: v.purchasePrice, avgCost: v.avgCost, trackInventory: v.product.trackInventory, trackBatches: v.product.trackBatches,
        stock: v.balances.reduce((a, b) => a.plus(D(b.quantity.toString())).minus(D(b.reserved.toString())), D(0)).toString(),
        baseUnit: { id: v.product.baseUnit.id, code: v.product.baseUnit.code, decimals: v.product.baseUnit.decimals },
        units: v.product.units.map((u) => ({ id: u.unitId, code: u.unit.code, factorToBase: u.factorToBase, decimals: u.unit.decimals })),
        attributes: { ...(v.product.attributes as AnyRec), ...(v.attributes as AnyRec) }, exactMatch: exact.some((e) => e.id === v.id),
      }));
    });
  }

  @Get('products/:id') @Can('products.view')
  get(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const p = await tx.product.findFirst({ where: { id, businessId: ctx.businessId }, include: productInclude });
      if (!p) throw new NotFoundException('Product not found');
      return { ...p, variants: p.variants.map((v) => hideCost(ctx, v)) };
    });
  }
  @Post('products') @Can('products.manage') @ApiZod(productSchema)
  create(@CurrentCtx() ctx: Ctx, @ZBody(productSchema) body: ProductInput, @Query('allowDuplicate') allowDuplicate?: string) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => this.catalog.create(tx, ctx, body, allowDuplicate === 'true'));
  }
  @Put('products/:id') @Can('products.manage') @ApiZod(productSchema)
  update(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(productSchema) body: ProductInput) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => this.catalog.update(tx, ctx, id, body));
  }

  /** Bulk import (rows parsed from CSV/Excel in the browser). All-or-nothing; reports the failing row. */
  @Post('products/import') @Can('products.manage') @ApiZod(productImportSchema)
  import(@CurrentCtx() ctx: Ctx, @ZBody(productImportSchema) body: z.infer<typeof productImportSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const units = new Map((await tx.unit.findMany({ where: { businessId: ctx.businessId } })).map((u) => [u.code, u.id]));
      const cats = new Map((await tx.category.findMany({ where: { businessId: ctx.businessId, parentId: null } })).map((c) => [c.name.toLowerCase(), c.id]));
      let created = 0, skipped = 0;
      for (const [i, r] of body.rows.entries()) {
        const unitId = units.get(r.unit);
        if (!unitId) throw new BadRequestException(`Row ${i + 1}: unknown unit "${r.unit}"`);
        if (await tx.product.findFirst({ where: { businessId: ctx.businessId, name: { equals: r.name, mode: 'insensitive' } }, select: { id: true } })) { skipped++; continue; }
        let categoryId: string | null = null;
        if (r.category) {
          categoryId = cats.get(r.category.toLowerCase()) ?? null;
          if (!categoryId) { categoryId = (await tx.category.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, name: r.category } })).id; cats.set(r.category.toLowerCase(), categoryId); }
        }
        const parsed = productSchema.safeParse({ name: r.name, categoryId, hsnCode: r.hsnCode ?? '', gstRate: r.gstRate, baseUnitId: unitId, warehouseId: body.warehouseId,
          variants: [{ sku: r.sku, sellingPrice: r.sellingPrice, purchasePrice: r.purchasePrice, mrp: r.mrp, barcodes: r.barcode ? [r.barcode] : [], openingStock: r.openingStock }] });
        if (!parsed.success) throw new BadRequestException(`Row ${i + 1}: ${parsed.error.issues[0]?.message}`);
        try { await this.catalog.create(tx, ctx, parsed.data, true); created++; }
        catch (e) { throw new BadRequestException(`Row ${i + 1} (${r.name}): ${e instanceof Error ? e.message : 'failed'}`); }
      }
      await this.audit.log(tx, ctx, 'product.import', 'Product', null, { summary: `${created} created, ${skipped} skipped as duplicates` });
      return { created, skipped };
    });
  }

  /** Branch-specific selling price; null removes the override. */
  @Put('catalog/branch-prices') @Can('products.manage') @ApiZod(branchPriceSchema)
  branchPrice(@CurrentCtx() ctx: Ctx, @ZBody(branchPriceSchema) body: z.infer<typeof branchPriceSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const [branch, variant] = await Promise.all([tx.branch.findFirst({ where: { id: body.branchId, businessId: ctx.businessId } }), tx.productVariant.findFirst({ where: { id: body.variantId, businessId: ctx.businessId } })]);
      if (!branch || !variant) throw new NotFoundException('Branch or product not found');
      const key = { branchId_variantId: { branchId: body.branchId, variantId: body.variantId } };
      if (body.sellingPrice === null) await tx.branchPrice.deleteMany({ where: { branchId: body.branchId, variantId: body.variantId } });
      else await tx.branchPrice.upsert({ where: key, update: { sellingPrice: body.sellingPrice }, create: { tenantId: ctx.tenantId, ...body, sellingPrice: body.sellingPrice } });
      await this.audit.log(tx, ctx, 'product.branch_price', 'ProductVariant', variant.id, { summary: `${branch.name}: ${body.sellingPrice ?? 'removed'}` });
      return { ok: true };
    });
  }
}
