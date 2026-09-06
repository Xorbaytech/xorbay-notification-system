import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Broadcast API (e2e)', () => {
  let app: INestApplication;
  const key = process.env.PUBLISHER_API_KEY ?? 'local-development-key';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/broadcasts (POST) - succeeds with valid payload', () => {
    const correlationId = `broadcast-corr-${Date.now()}`;
    return request(app.getHttpServer())
      .post('/api/v1/broadcasts')
      .set('x-tenant-id', 'tenant-1')
      .set('x-publisher-key', key)
      .send({
        tenantId: 'tenant-1',
        sourceModuleId: 'broadcast-module',
        templateIdentity: 'BroadcastTemplate',
        templateVersion: '1',
        correlationId,
        recipients: [
          { recipientId: 'user-1' },
          { recipientId: 'user-2', profile: { email: 'user2@example.com' } },
        ],
        channel: 'EMAIL',
      })
      .expect(202)
      .expect((res) => {
        expect(res.body.communicationId).toBeDefined();
        expect(res.body.deliveryCount).toBe(2);
        expect(res.body.status).toBe('QUEUED');
      });
  });
});
