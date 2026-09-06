import { BadRequestException, Controller, Get, Post, Param, Query, Body, HttpCode, NotFoundException, UseGuards, Req } from '@nestjs/common';
import { QueryCommunicationStatusUseCase } from '../application/query-communication-status.use-case';
import { CancelCommunicationUseCase } from '../application/cancel-communication.use-case';
import { CancelCommunicationDto } from '../dto/communication-api.dto';
import { PublisherAuthGuard } from './publisher-auth.guard';

@Controller('communications')
@UseGuards(PublisherAuthGuard)
export class CommunicationController {
  constructor(
    private readonly queryStatus: QueryCommunicationStatusUseCase,
    private readonly cancelCommunication: CancelCommunicationUseCase,
  ) {}

  @Get(':id')
  async getStatus(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Req() req: any,
  ) {
    // Accept the tenant from the authenticated publisher header as well as the
    // query string. ERP's server-side client already sends x-tenant-id; making
    // the status endpoint honor that canonical header avoids a misleading 500
    // when callers omit a redundant query parameter.
    const resolvedTenantId = tenantId || req?.headers?.['x-tenant-id'];
    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required');
    }
    const result = await this.queryStatus.execute(id, resolvedTenantId);
    if (!result) {
      throw new NotFoundException({
        error: { code: 'COMMUNICATION_NOT_FOUND', message: `Communication ${id} not found.` }
      });
    }
    return result;
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string, @Body() body: CancelCommunicationDto) {
    return this.cancelCommunication.execute({
      communicationId: id,
      tenantId: body.tenantId,
      correlationId: body.correlationId,
    });
  }
}
