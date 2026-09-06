import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Template DTOs ────────────────────────────────────────────────────────────

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  sourceModuleId!: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string;

  /** Logical template name / slug, e.g. "AttendanceMarked" */
  @IsString()
  @IsNotEmpty()
  identity!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  /** The rendered content object (subject, body, etc.) */
  @IsObject()
  content!: Record<string, unknown>;
}

// ─── Recipient DTOs ───────────────────────────────────────────────────────────

export class CreateRecipientDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  sourceModuleId!: string;

  /** Domain-level recipient identifier (e.g. student-001) */
  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  /** Contact details: email, phone, pushToken, name, language, etc. */
  @IsObject()
  profile!: Record<string, unknown>;
}

export class UpdateRecipientDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  sourceModuleId!: string;

  /** Partial profile update; merged server-side */
  @IsObject()
  profile!: Record<string, unknown>;
}

// ─── Preference DTOs ──────────────────────────────────────────────────────────

export class SetPreferenceDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  sourceModuleId!: string;

  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  @IsString()
  @IsNotEmpty()
  channel!: string;

  @IsString()
  @IsIn(['ALLOW', 'DENY'])
  decision!: 'ALLOW' | 'DENY';
}

// ─── Shared query params ──────────────────────────────────────────────────────

export class TenantQueryDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  sourceModuleId!: string;
}

export class TemplateQueryDto extends TenantQueryDto {
  @IsOptional()
  @IsString()
  eventType?: string;
}

export class PreferenceQueryDto extends TenantQueryDto {
  @IsOptional()
  @IsString()
  recipientId?: string;
}
