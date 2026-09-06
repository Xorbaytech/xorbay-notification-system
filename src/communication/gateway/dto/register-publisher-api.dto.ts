import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterEventDto {
  @IsString() @IsNotEmpty()
  eventType!: string;

  @IsOptional() @IsString()
  templateIdentity?: string;

  @IsOptional() @IsObject()
  template?: {
    subject?: string;
    body: string;
  };

  @IsOptional() @IsString()
  significanceDecision?: 'NOTIFY' | 'IGNORE' | 'AUDIT_ONLY';
}

export class RegisterPublisherDto {
  @IsString() @IsNotEmpty()
  tenantId!: string;

  @IsString() @IsNotEmpty()
  moduleId!: string;

  @IsOptional() @IsString()
  name?: string;

  @IsArray() @ValidateNested({ each: true })
  @Type(() => RegisterEventDto)
  events!: RegisterEventDto[];
}
