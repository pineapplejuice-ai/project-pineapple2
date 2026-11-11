import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Param, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DEFAULT_UNITS, PLANS, STANDARD_GST_RATES, SYSTEM_ROLES, TRIAL_DAYS, type PlanCode, type SystemRole } from '@nexbill/shared';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, switchTenantSchema, verifyEmailSchema } from '@nexbill/validation';
import * as argon2 from 'argon2';
import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { config } from '../config';
import { MessagingService } from '../common/core.services';
import { Ctx, CurrentCtx, Public } from '../common/context';
import { PrismaService, Tx } from '../common/prisma.service';
import { ApiZod, ZBody } from '../common/zod';

const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');
const newToken = (): string => randomBytes(48).toString('base64url');
const COOKIE = 'nb_rt';
const DEFAULT_EXPENSE_CATEGORIES = ['Rent', 'Electricity', 'Salaries', 'Transport', 'Miscellaneous'];

/** Seeds everything a brand-new business needs. Runs inside a tenant-bound transaction. */
export async function seedBusinessDefaults(tx: Tx, tenantId: string, businessId: string): Promise<void> {
  const branch = await tx.branch.create({ data: { tenantId, businessId, name: 'Main Branch', code: 'MAIN', isDefault: true } });
  await tx.warehouse.create({ data: { tenantId, businessId, branchId: branch.id, name: 'Main Store', isDefault: true } });
  await tx.unit.createMany({ data: DEFAULT_UNITS.map((u) => ({ tenantId, businessId, ...u })) });
  await tx.expenseCategory.createMany({ data: DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ tenantId, businessId, name })) });
  await tx.taxConfiguration.createMany({
    data: STANDARD_GST_RATES.map((r) => ({ tenantId, businessId, name: r === 0 ? 'GST 0% / Exempt' : `GST ${r}%`, gstRate: r })),
  });
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly messaging: MessagingService) {}

  private accessToken(userId: string, sessionId: string, tenantId: string): string {
    return jwt.sign({ sub: userId, sid: sessionId, tid: tenantId }, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.accessTokenTtlSec });
  }

  private async openSession(userId: string, tenantId: string, req: Request): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshToken = newToken();
    const session = await this.prisma.session.create({
      data: {
        userId, tenantId, refreshTokenHash: sha256(refreshToken), ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 300),
        expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86400000),
      },
    });
    return { accessToken: this.accessToken(userId, session.id, tenantId), refreshToken };
  }

  async register(input: z.infer<typeof registerSchema>, req: Request) {
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) throw new ConflictException('An account with this email already exists');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const verifyToken = newToken();
    const { user, tenant } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: input.email, name: input.name, phone: input.phone, passwordHash } });
      const tenant = await tx.tenant.create({ data: { name: input.businessName } });
      await tx.role.createMany({
        data: (Object.keys(SYSTEM_ROLES) as SystemRole[]).map((k) => ({ tenantId: tenant.id, systemKey: k, name: SYSTEM_ROLES[k].name, permissions: SYSTEM_ROLES[k].permissions })),
      });
      const owner = await tx.role.findFirstOrThrow({ where: { tenantId: tenant.id, systemKey: 'OWNER' } });
      await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, roleId: owner.id } });
      const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86400000);
      await tx.subscription.create({ data: { tenantId: tenant.id, plan: 'PRO', status: 'TRIALING', trialEndsAt: trialEnd, currentPeriodStart: new Date(), currentPeriodEnd: trialEnd } });
      await tx.authToken.create({ data: { userId: user.id, type: 'EMAIL_VERIFICATION', tokenHash: sha256(verifyToken), expiresAt: new Date(Date.now() + 3 * 86400000) } });
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
      const business = await tx.business.create({ data: { tenantId: tenant.id, name: input.businessName, ownerName: input.name, stateCode: input.stateCode, phone: input.phone, email: input.email } });
      await seedBusinessDefaults(tx, tenant.id, business.id);
      return { user, tenant };
    });
    await this.messaging.email.send(user.email, 'Verify your NEXBILL email', `${config.publicWebUrl}/verify-email?token=${verifyToken}`);
    const tokens = await this.openSession(user.id, tenant.id, req);
    return { ...tokens, devVerifyToken: config.exposeDevTokens ? verifyToken : undefined };
  }

  async login(input: z.infer<typeof loginSchema>, req: Request) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email }, include: { memberships: { where: { isActive: true }, orderBy: { createdAt: 'asc' } } } });
    const invalid = new UnauthorizedException('Incorrect email or password');
    if (!user) { await argon2.hash(input.password); throw invalid; } // equalise timing
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new ForbiddenException('Too many failed attempts. Try again in a few minutes.');
    if (!(await argon2.verify(user.passwordHash, input.password))) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60000) : null } });
      throw invalid;
    }
    if (!user.isActive) throw new ForbiddenException('This account has been disabled');
    const membership = user.memberships[0];
    if (!membership) throw new ForbiddenException('This account is not a member of any business');
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    return this.openSession(user.id, membership.tenantId, req);
  }

  /** Refresh-token rotation with reuse detection: replaying an old token revokes the whole session. */
  async refresh(token: string | undefined) {
    if (!token) throw new UnauthorizedException('Sign in to continue');
    const hash = sha256(token);
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });
    if (!session) {
      const reused = await this.prisma.session.findFirst({ where: { previousHashes: { has: hash } } });
      if (reused) await this.prisma.session.update({ where: { id: reused.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Session expired');
    }
    if (session.revokedAt || session.expiresAt < new Date() || !session.tenantId) throw new UnauthorizedException('Session expired');
    const refreshToken = newToken();
    // conditional update: only one of two concurrent refreshes with the same token can win
    const rotated = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
      data: { refreshTokenHash: sha256(refreshToken), previousHashes: [...session.previousHashes.slice(-4), hash], lastUsedAt: new Date() },
    });
    if (rotated.count !== 1) throw new UnauthorizedException('Session expired');
    return { accessToken: this.accessToken(session.userId, session.id, session.tenantId), refreshToken };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.prisma.session.updateMany({ where: { refreshTokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async switchTenant(ctx: Ctx, tenantId: string) {
    const m = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: ctx.userId } } });
    if (!m?.isActive) throw new ForbiddenException('You are not a member of that account');
    await this.prisma.session.update({ where: { id: ctx.sessionId }, data: { tenantId } });
    return { accessToken: this.accessToken(ctx.userId, ctx.sessionId, tenantId) };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    let token: string | undefined;
    if (user) {
      token = newToken();
      await this.prisma.authToken.create({ data: { userId: user.id, type: 'PASSWORD_RESET', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600000) } });
      await this.messaging.email.send(email, 'Reset your NEXBILL password', `${config.publicWebUrl}/reset-password?token=${token}`);
    }
    // identical response whether or not the email exists (no account enumeration)
    return { message: 'If that email is registered, a reset link has been sent.', devResetToken: config.exposeDevTokens ? token : undefined };
  }

  private async consume(token: string, type: 'PASSWORD_RESET' | 'EMAIL_VERIFICATION') {
    const used = await this.prisma.authToken.updateMany({ where: { tokenHash: sha256(token), type, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (used.count !== 1) throw new BadRequestException('This link is invalid or has expired');
    return this.prisma.authToken.findUniqueOrThrow({ where: { tokenHash: sha256(token) } });
  }

  async resetPassword(token: string, password: string) {
    const t = await this.consume(token, 'PASSWORD_RESET');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: t.userId }, data: { passwordHash: await argon2.hash(password, { type: argon2.argon2id }), failedLogins: 0, lockedUntil: null } }),
      this.prisma.session.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { message: 'Password updated. Sign in with your new password.' };
  }

  async verifyEmail(token: string) {
    const t = await this.consume(token, 'EMAIL_VERIFICATION');
    await this.prisma.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } });
    return { message: 'Email verified' };
  }

  async me(ctx: Ctx) {
    const [user, memberships, sub] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { id: true, name: true, email: true, phone: true, emailVerifiedAt: true, isPlatformAdmin: true } }),
      this.prisma.membership.findMany({ where: { userId: ctx.userId, isActive: true }, include: { tenant: { select: { id: true, name: true } }, role: { select: { name: true } } } }),
      this.prisma.subscription.findUnique({ where: { tenantId: ctx.tenantId } }),
    ]);
    const data = await this.prisma.tenantTx(ctx.tenantId, async (tx) => ({
      businesses: await tx.business.findMany({ orderBy: { createdAt: 'asc' } }),
      branches: await tx.branch.findMany({ where: { businessId: ctx.businessId, isActive: true, ...(ctx.branchIds.length ? { id: { in: ctx.branchIds } } : {}) }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
      warehouses: await tx.warehouse.findMany({ where: { businessId: ctx.businessId, isActive: true, ...(ctx.branchIds.length ? { branchId: { in: ctx.branchIds } } : {}) }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    }));
    const plan = (sub?.plan ?? 'STARTER') as PlanCode;
    return {
      user, tenantId: ctx.tenantId, businessId: ctx.businessId, permissions: ctx.permissions, roleKey: ctx.roleKey,
      tenants: memberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name, role: m.role.name })),
      subscription: sub && { plan: sub.plan, status: sub.status, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd, features: PLANS[plan].features, limits: PLANS[plan].limits },
      ...data,
    };
  }

  sessions(ctx: Ctx) {
    return this.prisma.session.findMany({
      where: { userId: ctx.userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, lastUsedAt: true, createdAt: true },
    }).then((s) => s.map((x) => ({ ...x, current: x.id === ctx.sessionId })));
  }
  async revokeSession(ctx: Ctx, id: string) {
    await this.prisma.session.updateMany({ where: { id, userId: ctx.userId }, data: { revokedAt: new Date() } });
    return { ok: true };
  }
}

const authLimit = { default: { limit: config.authRateLimitPerMinute, ttl: 60000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookie(res: Response, token: string): void {
    res.cookie(COOKIE, token, { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/', maxAge: config.refreshTokenTtlDays * 86400000 });
  }
  /** Cookie-authenticated endpoints require a custom header, which browsers will not send cross-site without CORS approval (CSRF defence). */
  private refreshTokenFrom(req: Request, body: { refreshToken?: string }): string | undefined {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[COOKIE];
    if (cookie && req.headers['x-nexbill-csrf'] !== '1') throw new ForbiddenException('Missing CSRF header');
    return cookie ?? body?.refreshToken;
  }

  @Public() @Throttle(authLimit) @Post('register') @ApiZod(registerSchema)
  async register(@ZBody(registerSchema) body: z.infer<typeof registerSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.register(body, req);
    this.setCookie(res, r.refreshToken);
    return r;
  }
  @Public() @Throttle(authLimit) @Post('login') @HttpCode(200) @ApiZod(loginSchema)
  async login(@ZBody(loginSchema) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(body, req);
    this.setCookie(res, r.refreshToken);
    return r;
  }
  @Public() @Throttle(authLimit) @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Body() body: { refreshToken?: string }, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.refresh(this.refreshTokenFrom(req, body));
    this.setCookie(res, r.refreshToken);
    return r;
  }
  @Public() @Post('logout') @HttpCode(200)
  async logout(@Req() req: Request, @Body() body: { refreshToken?: string }, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.refreshTokenFrom(req, body));
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }
  @Public() @Throttle(authLimit) @Post('forgot-password') @HttpCode(200) @ApiZod(forgotPasswordSchema)
  forgot(@ZBody(forgotPasswordSchema) body: z.infer<typeof forgotPasswordSchema>) { return this.auth.forgotPassword(body.email); }
  @Public() @Throttle(authLimit) @Post('reset-password') @HttpCode(200) @ApiZod(resetPasswordSchema)
  reset(@ZBody(resetPasswordSchema) body: z.infer<typeof resetPasswordSchema>) { return this.auth.resetPassword(body.token, body.password); }
  @Public() @Throttle(authLimit) @Post('verify-email') @HttpCode(200) @ApiZod(verifyEmailSchema)
  verify(@ZBody(verifyEmailSchema) body: z.infer<typeof verifyEmailSchema>) { return this.auth.verifyEmail(body.token); }

  @ApiBearerAuth() @Get('me') me(@CurrentCtx() ctx: Ctx) { return this.auth.me(ctx); }
  @ApiBearerAuth() @Post('switch-tenant') @HttpCode(200) @ApiZod(switchTenantSchema)
  switchTenant(@CurrentCtx() ctx: Ctx, @ZBody(switchTenantSchema) body: z.infer<typeof switchTenantSchema>) { return this.auth.switchTenant(ctx, body.tenantId); }
  @ApiBearerAuth() @Get('sessions') sessions(@CurrentCtx() ctx: Ctx) { return this.auth.sessions(ctx); }
  @ApiBearerAuth() @Delete('sessions/:id') revoke(@CurrentCtx() ctx: Ctx, @Param('id') id: string) { return this.auth.revokeSession(ctx, id); }
}
