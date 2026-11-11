import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@nexbill/database';
import { financialYear } from '@nexbill/shared';
import { randomUUID } from 'node:crypto';
import type { Ctx } from './context';
import type { Tx } from './prisma.service';

@Injectable()
export class AuditService {
  /** Writes an audit row inside the caller's transaction so it commits or rolls back with the change. */
  async log(tx: Tx, ctx: Ctx, action: string, entity: string, entityId: string | null,
    extra: { summary?: string; before?: unknown; after?: unknown } = {}): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId, businessId: ctx.businessId || null, userId: ctx.userId, action, entity, entityId,
        summary: extra.summary, ip: ctx.ip,
        before: extra.before === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(extra.before)) as Prisma.InputJsonValue),
        after: extra.after === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(extra.after)) as Prisma.InputJsonValue),
      },
    });
  }
}

@Injectable()
export class SequenceService {
  /**
   * Gapless, concurrency-safe document numbers. The upsert takes a row lock on the sequence, so
   * concurrent transactions queue; a rolled-back transaction releases its number. Format
   * PREFIX/YY-YY/0001 stays within the 16 characters GST allows for invoice numbers.
   */
  async next(tx: Tx, ctx: Ctx, docType: string, prefix: string, date: Date, fyStartMonth: number): Promise<{ number: string; fy: string }> {
    const fy = financialYear(date, fyStartMonth);
    const rows = await tx.$queryRaw<Array<{ n: number }>>`
      INSERT INTO "DocumentSequence" ("id", "tenantId", "businessId", "docType", "fy", "prefix", "nextNumber")
      VALUES (${randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${ctx.businessId}::uuid, ${docType}, ${fy}, ${prefix}, 2)
      ON CONFLICT ("businessId", "docType", "fy")
      DO UPDATE SET "nextNumber" = "DocumentSequence"."nextNumber" + 1
      RETURNING "nextNumber" - 1 AS n`;
    const n = rows[0]!.n;
    const fyShort = fy.includes('-') ? `${fy.slice(2, 4)}-${fy.slice(5)}` : fy.slice(2);
    return { number: `${prefix}/${fyShort}/${String(n).padStart(4, '0')}`, fy };
  }
}

/** Outbound message channels. Real providers (SES, MSG91, WhatsApp Business API) implement this. */
export interface MessageAdapter { send(to: string, subject: string, body: string): Promise<void> }

@Injectable()
export class MessagingService {
  private readonly log = new Logger('Messaging');
  private readonly console = (channel: string): MessageAdapter => ({
    send: async (to, subject) => { this.log.log(JSON.stringify({ channel, to, subject, delivered: false, note: 'no provider configured' })); },
  });
  readonly email: MessageAdapter = this.console('email');
  readonly sms: MessageAdapter = this.console('sms');
  readonly whatsapp: MessageAdapter = this.console('whatsapp');
}

@Injectable()
export class NotificationService {
  async raise(tx: Tx, ctx: Ctx, n: { type: string; title: string; body: string; entity?: string; entityId?: string; dedupeKey?: string }): Promise<void> {
    await tx.notification.createMany({
      data: [{ tenantId: ctx.tenantId, businessId: ctx.businessId, ...n }], skipDuplicates: true,
    });
  }
}
