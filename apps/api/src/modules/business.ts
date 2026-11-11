import { BadRequestException, ConflictException, Controller, Delete, ForbiddenException, Get, HttpException, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GRACE_DAYS, INDUSTRY_PROFILES, PERMISSIONS, PLANS, type Feature, type IndustryCode, type PlanCode } from '@nexbill/shared';
import { branchSchema, businessCreateSchema, businessUpdateSchema, changePlanSchema, listQuery, roleSchema, staffCreateSchema, staffUpdateSchema, warehouseSchema, type ListQuery } from '@nexbill/validation';
import * as argon2 from 'argon2';
import type { z } from 'zod';
import { AuditService } from '../common/core.services';
import { Can, Ctx, CurrentCtx } from '../common/context';
import { page, skipTake } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { ApiZod, ZBody, ZQuery } from '../common/zod';
import { seedBusinessDefaults } from './auth';

/** Mock gateway. A real adapter (Razorpay, Stripe, ...) implements the same interface; card data never touches NEXBILL. */
export interface PaymentGatewayAdapter { name: string; charge(tenantId: string, amountInr: string, description: string): Promise<{ ok: boolean; reference: string }> }
const mockGateway: PaymentGatewayAdapter = {
  name: 'mock',
  charge: async () => ({ ok: true, reference: `mock_${Date.now()}` }),
};

@Injectable()
export class SubscriptionService {
  readonly gateway: PaymentGatewayAdapter = mockGateway;
  constructor(private readonly prisma: PrismaService) {}

  async plan(tenantId: string): Promise<PlanCode> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    return (sub?.plan ?? 'STARTER') as PlanCode;
  }
  async assertFeature(tenantId: string, feature: Feature): Promise<void> {
    const plan = await this.plan(tenantId);
    if (!PLANS[plan].features.includes(feature))
      throw new HttpException({ message: `Your ${PLANS[plan].name} plan does not include this feature. Upgrade to use it.`, code: 'PLAN_FEATURE' }, 402);
  }
  async assertLimit(tx: Tx, ctx: Ctx, kind: 'businesses' | 'branches' | 'warehouses' | 'users' | 'invoicesPerMonth'): Promise<void> {
    const plan = await this.plan(ctx.tenantId);
    const limit = PLANS[plan].limits[kind];
    if (limit === null) return;
    const used = await this.usageOf(tx, ctx, kind);
    if (used >= limit) throw new HttpException({ message: `Your ${PLANS[plan].name} plan allows ${limit} ${kind === 'invoicesPerMonth' ? 'invoices per month' : kind}. Upgrade to add more.`, code: 'PLAN_LIMIT' }, 402);
  }
  private usageOf(tx: Tx, ctx: Ctx, kind: string): Promise<number> {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    switch (kind) {
      case 'businesses': return tx.business.count();
      case 'branches': return tx.branch.count({ where: { isActive: true } });
      case 'warehouses': return tx.warehouse.count({ where: { isActive: true } });
      case 'users': return this.prisma.membership.count({ where: { tenantId: ctx.tenantId, isActive: true } });
      default: return tx.salesInvoice.count({ where: { status: { not: 'DRAFT' }, createdAt: { gte: monthStart } } });
    }
  }
  async overview(ctx: Ctx) {
    const sub = await this.prisma.subscription.findUniqueOrThrow({ where: { tenantId: ctx.tenantId }, include: { invoices: { orderBy: { createdAt: 'desc' }, take: 24 } } });
    const usage = await this.prisma.tenantTx(ctx.tenantId, async (tx) => ({
      businesses: await this.usageOf(tx, ctx, 'businesses'), branches: await this.usageOf(tx, ctx, 'branches'),
      warehouses: await this.usageOf(tx, ctx, 'warehouses'), users: await this.usageOf(tx, ctx, 'users'),
      invoicesPerMonth: await this.usageOf(tx, ctx, 'invoicesPerMonth'),
    }));
    return { subscription: sub, graceDays: GRACE_DAYS, usage, plans: Object.values(PLANS), gateway: this.gateway.name };
  }
  /** Upgrades (and trial conversions) charge and apply now; downgrades are scheduled for the next renewal. */
  async changePlan(ctx: Ctx, plan: PlanCode) {
    const sub = await this.prisma.subscription.findUniqueOrThrow({ where: { tenantId: ctx.tenantId } });
    const current = PLANS[sub.plan as PlanCode], target = PLANS[plan];
    const isDowngrade = target.monthlyPriceInr < current.monthlyPriceInr && sub.status === 'ACTIVE';
    if (isDowngrade) {
      return this.prisma.subscription.update({ where: { id: sub.id }, data: { pendingPlan: plan } });
    }
    const amount = target.monthlyPriceInr, tax = Math.round(amount * 18) / 100;
    const charge = await this.gateway.charge(ctx.tenantId, (amount + tax).toFixed(2), `NEXBILL ${target.name} – 1 month`);
    if (!charge.ok) throw new HttpException({ message: 'Payment failed. Your plan was not changed.' }, 402);
    const start = new Date(), end = new Date(start); end.setMonth(end.getMonth() + 1);
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.subscriptionInvoice.count();
      await tx.subscriptionInvoice.create({ data: { tenantId: ctx.tenantId, subscriptionId: sub.id, number: `NB-SUB-${String(count + 1).padStart(6, '0')}-${Date.now().toString(36)}`, plan, amount, taxAmount: tax, total: amount + tax, periodStart: start, periodEnd: end, providerRef: charge.reference } });
      return tx.subscription.update({ where: { id: sub.id }, data: { plan, status: 'ACTIVE', trialEndsAt: null, currentPeriodStart: start, currentPeriodEnd: end, pendingPlan: null, cancelAtPeriodEnd: false, provider: this.gateway.name, providerRef: charge.reference } });
    });
  }
  cancel(ctx: Ctx) {
    return this.prisma.subscription.update({ where: { tenantId: ctx.tenantId }, data: { cancelAtPeriodEnd: true } });
  }
}

@ApiTags('subscription') @ApiBearerAuth()
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subs: SubscriptionService) {}
  @Get() @Can('subscription.manage') overview(@CurrentCtx() ctx: Ctx) { return this.subs.overview(ctx); }
  @Post('change-plan') @Can('subscription.manage') @ApiZod(changePlanSchema)
  change(@CurrentCtx() ctx: Ctx, @ZBody(changePlanSchema) b: z.infer<typeof changePlanSchema>) { return this.subs.changePlan(ctx, b.plan); }
  @Post('cancel') @Can('subscription.manage') cancel(@CurrentCtx() ctx: Ctx) { return this.subs.cancel(ctx); }
}

@ApiTags('business') @ApiBearerAuth()
@Controller()
export class BusinessController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly subs: SubscriptionService) {}

  @Get('business')
  get(@CurrentCtx() ctx: Ctx) { return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } })); }

  @Get('meta')
  meta() { return { industries: Object.values(INDUSTRY_PROFILES), permissions: PERMISSIONS }; }

  @Patch('business') @Can('settings.manage') @ApiZod(businessUpdateSchema)
  update(@CurrentCtx() ctx: Ctx, @ZBody(businessUpdateSchema) body: z.infer<typeof businessUpdateSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const before = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
      const gstRegistered = body.gstRegistered ?? before.gstRegistered;
      const gstin = body.gstin === undefined ? before.gstin : body.gstin;
      const stateCode = body.stateCode ?? before.stateCode;
      if (gstRegistered && !gstin) throw new BadRequestException('GSTIN is required for a GST registered business');
      if (gstin && gstin.slice(0, 2) !== stateCode) throw new BadRequestException('GSTIN state code does not match the business state');
      const after = await tx.business.update({ where: { id: ctx.businessId }, data: { ...body, gstin: gstRegistered ? gstin : null } });
      if (body.industry && body.industry !== before.industry) {
        // industry modules are configuration: selecting one only adds attribute definitions
        const profile = INDUSTRY_PROFILES[body.industry as IndustryCode];
        await tx.productAttribute.createMany({
          data: profile.attributes.map((a) => ({ tenantId: ctx.tenantId, businessId: ctx.businessId, key: a.key, label: a.label, type: a.type, unit: a.unit, options: a.options ?? [] })),
          skipDuplicates: true,
        });
      }
      await this.audit.log(tx, ctx, 'business.update', 'Business', ctx.businessId, { before, after });
      return after;
    });
  }

  @Post('businesses') @Can('settings.manage') @ApiZod(businessCreateSchema)
  createBusiness(@CurrentCtx() ctx: Ctx, @ZBody(businessCreateSchema) body: z.infer<typeof businessCreateSchema>) {
    if (ctx.roleKey !== 'OWNER') throw new ForbiddenException('Only the owner can add another business');
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.subs.assertLimit(tx, ctx, 'businesses');
      const b = await tx.business.create({ data: { tenantId: ctx.tenantId, ...body } });
      await seedBusinessDefaults(tx, ctx.tenantId, b.id);
      await this.audit.log(tx, ctx, 'business.create', 'Business', b.id, { after: b });
      return b;
    });
  }

  @Get('attributes')
  attributes(@CurrentCtx() ctx: Ctx) { return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.productAttribute.findMany({ where: { businessId: ctx.businessId } })); }

  /* ── branches & warehouses ── */
  @Get('branches')
  branches(@CurrentCtx() ctx: Ctx) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.branch.findMany({ where: { businessId: ctx.businessId }, include: { warehouses: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }));
  }
  @Post('branches') @Can('branches.manage') @ApiZod(branchSchema)
  async createBranch(@CurrentCtx() ctx: Ctx, @ZBody(branchSchema) body: z.infer<typeof branchSchema>) {
    await this.subs.assertFeature(ctx.tenantId, 'multi_branch');
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.subs.assertLimit(tx, ctx, 'branches');
      const b = await tx.branch.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, ...body } });
      await tx.warehouse.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: b.id, name: `${b.name} Store`, isDefault: false } });
      await this.audit.log(tx, ctx, 'branch.create', 'Branch', b.id, { after: b });
      return b;
    });
  }
  @Put('branches/:id') @Can('branches.manage') @ApiZod(branchSchema)
  updateBranch(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(branchSchema) body: z.infer<typeof branchSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const before = await tx.branch.findFirst({ where: { id, businessId: ctx.businessId } });
      if (!before) throw new NotFoundException('Branch not found');
      if (before.isDefault && !body.isActive) throw new BadRequestException('The default branch cannot be deactivated');
      const after = await tx.branch.update({ where: { id }, data: body });
      await this.audit.log(tx, ctx, 'branch.update', 'Branch', id, { before, after });
      return after;
    });
  }
  @Get('warehouses')
  warehouses(@CurrentCtx() ctx: Ctx) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.warehouse.findMany({ where: { businessId: ctx.businessId }, include: { branch: { select: { name: true } } }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }));
  }
  @Post('warehouses') @Can('branches.manage') @ApiZod(warehouseSchema)
  createWarehouse(@CurrentCtx() ctx: Ctx, @ZBody(warehouseSchema) body: z.infer<typeof warehouseSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.subs.assertLimit(tx, ctx, 'warehouses');
      if (!(await tx.branch.findFirst({ where: { id: body.branchId, businessId: ctx.businessId } }))) throw new NotFoundException('Branch not found');
      const w = await tx.warehouse.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, ...body } });
      await this.audit.log(tx, ctx, 'warehouse.create', 'Warehouse', w.id, { after: w });
      return w;
    });
  }
  @Put('warehouses/:id') @Can('branches.manage') @ApiZod(warehouseSchema)
  updateWarehouse(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(warehouseSchema) body: z.infer<typeof warehouseSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const before = await tx.warehouse.findFirst({ where: { id, businessId: ctx.businessId } });
      if (!before) throw new NotFoundException('Warehouse not found');
      if (before.isDefault && !body.isActive) throw new BadRequestException('The default warehouse cannot be deactivated');
      return tx.warehouse.update({ where: { id }, data: { name: body.name, isActive: body.isActive } });
    });
  }

  /* ── staff & roles (identity tables: scoped by tenantId from the verified context) ── */
  @Get('roles') @Can('staff.manage')
  roles(@CurrentCtx() ctx: Ctx) { return this.prisma.role.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'asc' } }); }

  @Post('roles') @Can('staff.manage') @ApiZod(roleSchema)
  async createRole(@CurrentCtx() ctx: Ctx, @ZBody(roleSchema) body: z.infer<typeof roleSchema>) {
    await this.subs.assertFeature(ctx.tenantId, 'custom_roles');
    this.assertGrantable(ctx, body.permissions);
    const role = await this.prisma.role.create({ data: { tenantId: ctx.tenantId, ...body } });
    await this.prisma.tenantTx(ctx.tenantId, (tx) => this.audit.log(tx, ctx, 'role.create', 'Role', role.id, { after: role }));
    return role;
  }
  @Put('roles/:id') @Can('staff.manage') @ApiZod(roleSchema)
  async updateRole(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(roleSchema) body: z.infer<typeof roleSchema>) {
    const before = await this.prisma.role.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!before) throw new NotFoundException('Role not found');
    if (before.systemKey) throw new BadRequestException('Built-in roles cannot be edited. Create a custom role instead.');
    this.assertGrantable(ctx, body.permissions);
    const after = await this.prisma.role.update({ where: { id }, data: body });
    await this.prisma.tenantTx(ctx.tenantId, (tx) => this.audit.log(tx, ctx, 'role.update', 'Role', id, { before, after }));
    return after;
  }
  /** Nobody can hand out a permission they do not hold themselves (no privilege escalation). */
  private assertGrantable(ctx: Ctx, perms: string[]): void {
    const extra = perms.filter((p) => !ctx.permissions.includes(p));
    if (extra.length) throw new ForbiddenException(`You cannot grant permissions you do not have: ${extra.join(', ')}`);
  }

  @Get('staff') @Can('staff.manage')
  async staff(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    const where = { tenantId: ctx.tenantId };
    const [rows, total] = await Promise.all([
      this.prisma.membership.findMany({ where, include: { user: { select: { id: true, name: true, email: true, emailVerifiedAt: true } }, role: { select: { id: true, name: true, systemKey: true } } }, orderBy: { createdAt: 'asc' }, ...skipTake(q) }),
      this.prisma.membership.count({ where }),
    ]);
    return page(rows, total, q);
  }
  @Post('staff') @Can('staff.manage') @ApiZod(staffCreateSchema)
  async addStaff(@CurrentCtx() ctx: Ctx, @ZBody(staffCreateSchema) body: z.infer<typeof staffCreateSchema>) {
    const role = await this.prisma.role.findFirst({ where: { id: body.roleId, tenantId: ctx.tenantId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.systemKey === 'OWNER') throw new ForbiddenException('There can be only one owner');
    this.assertGrantable(ctx, role.permissions);
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.subs.assertLimit(tx, ctx, 'users');
      const branches = await tx.branch.count({ where: { id: { in: body.branchIds } } });
      if (branches !== body.branchIds.length) throw new BadRequestException('Unknown branch');
      let user = await tx.user.findUnique({ where: { email: body.email } });
      if (user && (await tx.membership.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: user.id } } })))
        throw new ConflictException('This person is already on your team');
      // An existing NEXBILL user keeps their own password; the one supplied here is only used for new accounts.
      user ??= await tx.user.create({ data: { email: body.email, name: body.name, passwordHash: await argon2.hash(body.password, { type: argon2.argon2id }) } });
      const m = await tx.membership.create({ data: { tenantId: ctx.tenantId, userId: user.id, roleId: role.id, branchIds: body.branchIds } });
      await this.audit.log(tx, ctx, 'staff.add', 'Membership', m.id, { summary: `${body.email} added as ${role.name}`, after: { email: body.email, role: role.name, branchIds: body.branchIds } });
      return m;
    });
  }
  @Patch('staff/:id') @Can('staff.manage') @ApiZod(staffUpdateSchema)
  async updateStaff(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(staffUpdateSchema) body: z.infer<typeof staffUpdateSchema>) {
    const before = await this.prisma.membership.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { role: true } });
    if (!before) throw new NotFoundException('Team member not found');
    if (before.role.systemKey === 'OWNER') throw new ForbiddenException('The owner cannot be changed here');
    if (before.userId === ctx.userId) throw new ForbiddenException('You cannot change your own access');
    if (body.roleId) {
      const role = await this.prisma.role.findFirst({ where: { id: body.roleId, tenantId: ctx.tenantId } });
      if (!role || role.systemKey === 'OWNER') throw new BadRequestException('Role not available');
      this.assertGrantable(ctx, role.permissions);
    }
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const after = await tx.membership.update({ where: { id }, data: body });
      if (body.isActive === false) await tx.session.updateMany({ where: { userId: before.userId, tenantId: ctx.tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, ctx, 'staff.update', 'Membership', id, { before: { roleId: before.roleId, branchIds: before.branchIds, isActive: before.isActive }, after: body });
      return after;
    });
  }

  /* ── audit & notifications ── */
  @Get('audit-logs') @Can('audit.view')
  auditLogs(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where = { ...(q.q ? { OR: [{ action: { contains: q.q } }, { entity: { contains: q.q } }] } : {}) };
      const [rows, total] = await Promise.all([tx.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }), tx.auditLog.count({ where })]);
      const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
      const names = new Map(users.map((u) => [u.id, u.name]));
      return page(rows.map((r) => ({ ...r, userName: names.get(r.userId) ?? 'Unknown' })), total, q);
    });
  }
  @Get('notifications')
  notifications(@CurrentCtx() ctx: Ctx) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => ({
      unread: await tx.notification.count({ where: { businessId: ctx.businessId, readAt: null } }),
      items: await tx.notification.findMany({ where: { businessId: ctx.businessId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    }));
  }
  @Post('notifications/read-all')
  readAll(@CurrentCtx() ctx: Ctx) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.notification.updateMany({ where: { businessId: ctx.businessId, readAt: null }, data: { readAt: new Date() } }));
  }
  @Delete('notifications/:id')
  dismiss(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.notification.updateMany({ where: { id, businessId: ctx.businessId }, data: { readAt: new Date() } }));
  }
}
