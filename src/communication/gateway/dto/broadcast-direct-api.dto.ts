import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BroadcastRecipientDto {
  @IsString() @IsNotEmpty() recipientId!: string;
  /** Contact details override — if omitted, system resolves from recipients table */
  @IsOptional() @IsObject() profile?: Record<string, unknown>;
}

export class BroadcastCommunicationDto {
  @IsString() @IsNotEmpty() tenantId!: string;
  @IsString() @IsNotEmpty() sourceModuleId!: string;
  @IsString() @IsNotEmpty() templateIdentity!: string;
  @IsOptional() @IsString() templateVersion?: string;
  @IsString() @IsNotEmpty() correlationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BroadcastRecipientDto)
  recipients!: BroadcastRecipientDto[];

  /** Optional channel override — defaults to EMAIL */
  @IsOptional() @IsString() channel?: string;

  /** Optional payload to pass through for template rendering */
  @IsOptional() @IsObject() payload?: Record<string, unknown>;

  /** Reusing this key makes a retried request resolve to the same campaign. */
  @IsOptional() @IsString() idempotencyKey?: string;
}

// ─── Direct Communication ─────────────────────────────────────────────────────

export class DirectCommunicationDto {
  @IsString() @IsNotEmpty() tenantId!: string;
  @IsString() @IsNotEmpty() sourceModuleId!: string;
  @IsString() @IsNotEmpty() channel!: string;

  /** Direct recipient contact address (e.g. email address or phone number) */
  @IsString() @IsNotEmpty() recipient!: string;

  @IsString() @IsNotEmpty() templateIdentity!: string;
  @IsOptional() @IsString() templateVersion?: string;
  @IsString() @IsNotEmpty() correlationId!: string;

  /** Optional payload to pass through for template rendering */
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}
