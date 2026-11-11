import { createParamDecorator, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import type { Permission } from '@nexbill/shared';

/** Server-resolved identity for one request. Nothing here is taken from the request body. */
export interface Ctx {
  userId: string;
  sessionId: string;
  tenantId: string;
  businessId: string;
  roleKey: string | null;
  permissions: string[];
  /** branches this member may act in; empty = all */
  branchIds: string[];
  isPlatformAdmin: boolean;
  ip?: string;
}

export const PUBLIC_KEY = 'nb:public';
export const PERMS_KEY = 'nb:perms';
export const NO_BUSINESS_KEY = 'nb:nobusiness';
/** Route needs no authentication. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Route needs every listed permission (checked server-side in the global guard). */
export const Can = (...perms: Permission[]) => SetMetadata(PERMS_KEY, perms);

export const CurrentCtx = createParamDecorator((_: unknown, ec: ExecutionContext): Ctx => ec.switchToHttp().getRequest().ctx);

export const can = (ctx: Ctx, perm: Permission): boolean => ctx.permissions.includes(perm);
export function assertCan(ctx: Ctx, perm: Permission): void {
  if (!can(ctx, perm)) throw new ForbiddenException(`Missing permission: ${perm}`);
}
export function assertBranchAccess(ctx: Ctx, branchId: string): void {
  if (ctx.branchIds.length > 0 && !ctx.branchIds.includes(branchId))
    throw new ForbiddenException('You do not have access to this branch');
}

/** Prisma filter for branch-scoped lists: honours an explicit branch only if the member may see it. */
export function branchScope(ctx: Ctx, requested?: string | null): string | { in: string[] } | undefined {
  if (requested) { assertBranchAccess(ctx, requested); return requested; }
  return ctx.branchIds.length ? { in: ctx.branchIds } : undefined;
}
