import { Module } from '@nestjs/common';
import { PrismaModule } from '../persistence/prisma.module';
import { AUDIT } from './ports/audit.port';
import { PrismaAuditRepository } from './prisma-audit.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaAuditRepository,
    {
      provide: AUDIT,
      useExisting: PrismaAuditRepository,
    },
  ],
  exports: [AUDIT],
})
export class AuditModule {}
