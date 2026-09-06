import { IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';

export class CancelCommunicationDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  correlationId!: string;
}

export class ScheduleCommunicationDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  deliveryId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['ONE_SHOT', 'RECURRING'])
  mode!: 'ONE_SHOT' | 'RECURRING';

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  cronExpression?: string;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsString()
  @IsNotEmpty()
  timezone!: string;

  @IsString()
  @IsNotEmpty()
  correlationId!: string;
}
