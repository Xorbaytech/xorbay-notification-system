import { Controller, Get, HttpCode, Param, Post, Query, Inject, UseGuards } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RequeueDeadLetterUseCase } from '../../execution/workers/requeue-dead-letter.use-case';
import { PublisherAuthGuard } from './publisher-auth.guard';

@Controller('dlq')
@UseGuards(PublisherAuthGuard)
export class DlqController {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly requeueUseCase: RequeueDeadLetterUseCase,
  ) {}

  @Get()
  async list(@Query('tenantId') tenantId: string) {
    return this.prisma.deadLetterRecord.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/requeue')
  @HttpCode(202)
  async requeue(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    await this.requeueUseCase.execute({
      tenantId,
      deadLetterId: id,
    });
    return { status: 'REQUEUED' };
  }
}
