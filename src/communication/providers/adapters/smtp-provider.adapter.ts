import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { DeliveryExecutionContext } from '../../common/interfaces/delivery-execution-context.port';
import {
  ProviderDeliveryResult,
  ProviderDispatchPort,
} from '../../common/interfaces/provider-dispatch.port';

@Injectable()
export class SmtpProviderAdapter implements ProviderDispatchPort, OnModuleInit {
  private readonly logger = new Logger(SmtpProviderAdapter.name);
  private transporter: nodemailer.Transporter;

  async onModuleInit(): Promise<void> {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      // Use configured SMTP
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      this.logger.log(`SMTP configured via environment variables (host: ${process.env.SMTP_HOST})`);
    } else if (!process.env.SMTP_HOST && process.env.NODE_ENV !== 'production') {
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        this.logger.log(`Created fresh Ethereal test account: ${testAccount.user}`);
        this.logger.log(`Ethereal Password: ${testAccount.pass}`);
        this.logger.log(`Ethereal test account ready. Login at: https://ethereal.email/login`);
      } catch (err: any) {
        this.logger.error(`Failed to create Ethereal test account: ${err.message}. SMTP Provider is disabled.`);
      }
    }
  }

  async dispatch(context: DeliveryExecutionContext): Promise<ProviderDeliveryResult> {
    if (context.channel !== 'EMAIL' || !this.transporter) {
      return {
        outcome: 'FAILED',
        failureCategory: 'TRANSIENT',
        occurredAt: new Date(),
        providerMessageId: null,
        providerStatusReference: 'SMTP',
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from: '"Notification Platform" <noreply@example.com>',
        to: context.recipient,
        subject: context.subject || `Notification for ${context.eventType || 'Event'}`,
        text: typeof context.content === 'string'
          ? context.content
          : JSON.stringify(context.content ?? 'You have a new notification.'),
        html: typeof context.content === 'string'
          ? context.content
          : `<pre>${JSON.stringify(context.content ?? 'You have a new notification.', null, 2)}</pre>`,
        headers: {
          'X-Delivery-ID': context.deliveryId,
          'X-Tenant-ID': context.tenantId,
        },
      });

      const previewUrl = nodemailer.getTestMessageUrl(info);
      this.logger.log(`✅ Email sent: ${info.messageId}`);
      if (previewUrl) {
        this.logger.log(`📧 Preview URL: ${previewUrl}`);
      }

      return {
        outcome: 'ACCEPTED',
        providerMessageId: info.messageId,
        providerStatusReference: 'SMTP',
        failureCategory: null,
        occurredAt: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`SMTP delivery failed: ${error.message}`, error.stack);

      return {
        outcome: 'FAILED',
        failureCategory: (error.responseCode ?? 0) >= 500 ? 'PERMANENT' : 'TRANSIENT',
        occurredAt: new Date(),
        providerMessageId: null,
        providerStatusReference: 'SMTP',
      };
    }
  }
}
