import { Module } from '@nestjs/common';
import { EVENT_VALIDATOR } from './ports/event-validator.port';
import { PrismaEventValidatorAdapter } from './adapters/prisma-event-validator.adapter';
import { PrismaModule } from '../persistence/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaEventValidatorAdapter,
    { provide: EVENT_VALIDATOR, useExisting: PrismaEventValidatorAdapter },
  ],
  exports: [EVENT_VALIDATOR],
})
export class ValidationModule {}
