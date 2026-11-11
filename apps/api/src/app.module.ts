import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { config } from './config';
import { AuthGuard } from './common/auth.guard';
import { Public } from './common/context';
import { AuditService, MessagingService, NotificationService, SequenceService } from './common/core.services';
import { AllExceptionsFilter } from './common/http';
import { PrismaService } from './common/prisma.service';
import { AuthController, AuthService } from './modules/auth';
import { BusinessController, SubscriptionController, SubscriptionService } from './modules/business';
import { CatalogController, CatalogService } from './modules/catalog';
import { InventoryController, StockService } from './modules/inventory';
import { PartiesController } from './modules/parties';
import { PaymentsController } from './modules/payments';
import { PurchaseService, PurchasesController } from './modules/purchases';
import { ReportsController, ReportService } from './modules/reports';
import { PublicInvoiceController, SalesController, SalesService } from './modules/sales';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  /** Liveness + database readiness for load balancers and uptime monitors. */
  @Public() @Get()
  async health() {
    const started = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'up', dbLatencyMs: Date.now() - started, uptimeSec: Math.round(process.uptime()) };
  }
}

/**
 * Modular monolith: one deployable, with each business area in its own module file under
 * src/modules and shared infrastructure in src/common. Module boundaries are service classes,
 * so any area can later be split out without touching the others.
 */
@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: config.rateLimitPerMinute }])],
  controllers: [HealthController, AuthController, BusinessController, SubscriptionController, CatalogController, InventoryController,
    PartiesController, SalesController, PublicInvoiceController, PurchasesController, PaymentsController, ReportsController],
  providers: [
    PrismaService, AuditService, SequenceService, MessagingService, NotificationService,
    AuthService, SubscriptionService, CatalogService, StockService, SalesService, PurchaseService, ReportService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
