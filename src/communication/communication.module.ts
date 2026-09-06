import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { BusinessModule } from './business/business.module';
import { CommonModule } from './common/common.module';
import { ExecutionModule } from './execution/execution.module';
import { GatewayModule } from './gateway/gateway.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { PlanningModule } from './planning/planning.module';
import { ProviderModule } from './providers/provider.module';
import { PrismaModule } from './persistence/prisma.module';
import { RecipientModule } from './recipient/recipient.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { TemplateModule } from './template/template.module';
import { ValidationModule } from './validation/validation.module';

@Module({
  imports: [
    CommonModule,
    ValidationModule,
    PrismaModule,
    RepositoriesModule,
    GatewayModule,
    BusinessModule,
    RecipientModule,
    TemplateModule,
    PlanningModule,
    ExecutionModule,
    ProviderModule,
    InfrastructureModule,
    AuditModule,
  ],
})
export class CommunicationModule {}
