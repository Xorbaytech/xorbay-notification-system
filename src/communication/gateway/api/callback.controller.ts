import {
  Controller,
  Post,
  Body,
  Param,
  HttpCode,
  RawBodyRequest,
  Headers,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ProcessProviderCallbackUseCase } from '../../execution/dispatcher/process-provider-callback.use-case';
import { ProviderFailureCategory } from '../../common/interfaces/provider-dispatch.port';

export class ProviderCallbackDto {
  @IsString()
  tenantId!: string;
  @IsString()
  deliveryId!: string;
  @IsString()
  attemptId!: string;
  @IsIn(['DELIVERED', 'FAILED'])
  outcome!: 'DELIVERED' | 'FAILED';
  @IsOptional() @IsString()
  providerRef?: string;
  @IsOptional() @IsString()
  failureCategory?: ProviderFailureCategory;
  @IsOptional() @IsString()
  responseCode?: string;
  @IsOptional() @IsString()
  errorMessage?: string;
  @IsOptional() @IsString()
  providerEventId?: string;
  @IsString()
  correlationId!: string;
}

/**
 * HMAC signature verification for provider callbacks.
 *
 * Providers POST delivery status updates here. The request body is signed with
 * HMAC-SHA256 using a shared secret (ERP_CALLBACK_SECRET). The signature
 * travels in the `x-signature` header.
 */
function verifyCallbackSignature(
  body: string,
  signature: string | undefined,
  secret: string,
): boolean {
  // A missing secret is a deployment error. Never silently disable callback
  // authentication; fail closed in every environment.
  if (!secret || !signature) return false;

  const normalized = signature.trim().replace(/^sha256=/i, '');
  // Signature must be exactly the 32-byte SHA-256 digest encoded as hex.
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;

  const expected = createHmac('sha256', secret).update(body).digest();
  const provided = Buffer.from(normalized, 'hex');
  return provided.length === expected.length && timingSafeEqual(expected, provided);
}

export { verifyCallbackSignature };

/** Resolve a provider-specific secret, with the shared secret as a migration fallback. */
function callbackSecretFor(provider: string): string {
  const key = provider.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return process.env[`CALLBACK_SECRET_${key}`]
    || process.env.PROVIDER_CALLBACK_SECRET
    || process.env.ERP_CALLBACK_SECRET
    || '';
}

export { callbackSecretFor };

@Controller('callbacks')
export class CallbackController {
  constructor(private readonly processCallback: ProcessProviderCallbackUseCase) {}

  @Post(':provider')
  @HttpCode(202)
  async handleCallback(
    @Param('provider') provider: string,
    @Body() body: ProviderCallbackDto,
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-signature') signature?: string,
  ) {
    const secret = callbackSecretFor(provider);
    const rawBody = request.rawBody?.toString('utf8');
    if (!rawBody || !verifyCallbackSignature(rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid callback signature');
    }

    // In a real implementation, each provider would have a specific adapter that
    // normalizes the provider's specific webhook payload into this generic structure.
    // For MVP/Slice 5, we assume the payload is pre-normalized or normalized by a middleware.
    await this.processCallback.execute({
      tenantId: body.tenantId,
      provider,
      providerEventId: body.providerEventId || body.providerRef || createHash('sha256').update(rawBody).digest('hex'),
      deliveryId: body.deliveryId,
      attemptId: body.attemptId,
      outcome: body.outcome,
      providerRef: body.providerRef,
      failureCategory: body.failureCategory,
      responseCode: body.responseCode,
      errorMessage: body.errorMessage,
      correlationId: body.correlationId,
      occurredAt: new Date(),
    });

    return { status: 'ACCEPTED' };
  }
}
