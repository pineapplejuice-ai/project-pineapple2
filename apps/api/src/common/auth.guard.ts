import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GRACE_DAYS } from '@nexbill/shared';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import { Ctx, PERMS_KEY, PUBLIC_KEY } from './context';
import { PrismaService } from './prisma.service';

export interface AccessClaims { sub: string; sid: string; tid: string }

/**
 * Global guard. Resolves the tenant from the signed token + a live membership lookup (never from a
 * client-supplied tenant id), validates the requested business inside that tenant, enforces route
 * permissions and blocks writes for lapsed subscriptions.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ec.getHandler(), ec.getClass()])) return true;
    const req = ec.switchToHttp().getRequest<Request & { ctx?: Ctx }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Sign in to continue');
    let claims: AccessClaims;
    try {
      claims = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'] }) as AccessClaims;
    } catch {
      throw new UnauthorizedException('Session expired');
    }

    const [session, membership] = await Promise.all([
      this.prisma.session.findUnique({ where: { id: claims.sid }, select: { revokedAt: true, expiresAt: true, userId: true } }),
      this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId: claims.tid, userId: claims.sub } },
        include: { role: true, user: { select: { isActive: true, isPlatformAdmin: true } }, tenant: { include: { subscription: true } } },
      }),
    ]);
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== claims.sub)
      throw new UnauthorizedException('Session expired');
    if (!membership || !membership.isActive || !membership.user.isActive || membership.tenant.status !== 'ACTIVE')
      throw new ForbiddenException('You no longer have access to this account');

    const requested = req.headers['x-business-id'];
    const business = await this.prisma.tenantTx(claims.tid, (tx) =>
      typeof requested === 'string' && /^[0-9a-f-]{36}$/i.test(requested)
        ? tx.business.findFirst({ where: { id: requested, tenantId: claims.tid }, select: { id: true } })
        : tx.business.findFirst({ where: { tenantId: claims.tid }, orderBy: { createdAt: 'asc' }, select: { id: true } }));
    if (!business) throw new ForbiddenException('Business not found in your account');

    const ctx: Ctx = {
      userId: claims.sub, sessionId: claims.sid, tenantId: claims.tid, businessId: business.id,
      roleKey: membership.role.systemKey, permissions: membership.role.permissions, branchIds: membership.branchIds,
      isPlatformAdmin: membership.user.isPlatformAdmin, ip: req.ip,
    };
    req.ctx = ctx;

    const needed = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, [ec.getHandler(), ec.getClass()]) ?? [];
    const missing = needed.filter((p) => !ctx.permissions.includes(p));
    if (missing.length) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);

    if (req.method !== 'GET' && !/\/(auth|subscription)\//.test(req.path)) {
      const sub = membership.tenant.subscription;
      const graceEnd = sub ? new Date(sub.currentPeriodEnd.getTime() + GRACE_DAYS * 86400000) : new Date(0);
      const usable = sub && sub.status !== 'CANCELLED' && sub.status !== 'EXPIRED' &&
        (sub.status === 'TRIALING' ? (sub.trialEndsAt ?? sub.currentPeriodEnd) > new Date() : graceEnd > new Date());
      if (!usable) throw new HttpException({ message: 'Your subscription has ended. Renew to continue billing; your data is safe and still readable.', code: 'SUBSCRIPTION_INACTIVE' }, 402);
    }
    return true;
  }
}
