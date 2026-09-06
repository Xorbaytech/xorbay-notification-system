import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertSignificanceRuleDto {
  @IsString() @IsNotEmpty() tenantId!: string;
  @IsString() @IsNotEmpty() sourceModuleId!: string;
  @IsString() @IsNotEmpty() eventType!: string;

  @IsString()
  @IsIn(['NOTIFY', 'IGNORE', 'AUDIT_ONLY'])
  decision!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  priority?: number;
}

export class UpsertPolicyRuleDto {
  @IsString() @IsNotEmpty() tenantId!: string;
  @IsString() @IsNotEmpty() sourceModuleId!: string;
  @IsString() @IsNotEmpty() eventType!: string;

  @IsString()
  @IsIn(['ALLOWED', 'SUPPRESSED', 'DELAYED', 'ESCALATED', 'MODIFIED'])
  decision!: string;

  @IsOptional() @IsString() templateIdentity?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) templateVersion?: number;
  @IsOptional() @IsString() reason?: string;
}
