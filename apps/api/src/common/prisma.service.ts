import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@nexbill/database';
import { config } from '../config';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Billing transactions hold a connection while they wait on row locks, so size the pool for
    // peak concurrent writers (override with ?connection_limit= in DATABASE_URL).
    const url = config.databaseUrl.includes('connection_limit') ? config.databaseUrl
      : `${config.databaseUrl}${config.databaseUrl.includes('?') ? '&' : '?'}connection_limit=${config.dbPoolSize}`;
    super({ datasources: { db: { url } } });
  }
  async onModuleInit(): Promise<void> { await this.$connect(); }
  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }

  /**
   * Runs `fn` in one database transaction bound to a tenant. This is the ONLY way tenant-owned
   * tables are reached: it sets `app.tenant_id` for PostgreSQL row-level security, so even a query
   * that forgets its tenant filter cannot see or write another tenant's rows.
   */
  tenantTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    }, { timeout: 20000, maxWait: 10000 });
  }
}
