import { Type } from 'class-transformer';
import { IsISO8601, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

class PublisherDto {
  @IsString()
  @IsNotEmpty()
  moduleId!: string;

  @IsString()
  @IsNotEmpty()
  environment!: string;
}

class AggregateDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @Type(() => Number)
  @IsNotEmpty()
  version!: number;
}

export class BusinessEventDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @ValidateNested()
  @Type(() => PublisherDto)
  publisher!: PublisherDto;

  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ValidateNested()
  @Type(() => AggregateDto)
  aggregate!: AggregateDto;

  @IsISO8601()
  occurredAt!: string;

  @IsString()
  @IsNotEmpty()
  schemaVersion!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  correlationId!: string;

  @IsOptional()
  @IsIn(['CRITICAL', 'NORMAL', 'BULK'])
  priorityHint?: 'CRITICAL' | 'NORMAL' | 'BULK';
}
