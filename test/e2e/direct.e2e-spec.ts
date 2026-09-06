import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Direct Communication API (e2e)', () => {
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

  it('/api/v1/direct (POST) - succeeds with valid payload', () => {
    const correlationId = `direct-corr-${Date.now()}`;
    return request(app.getHttpServer())
      .post('/api/v1/direct')
      .set('x-tenant-id', 'tenant-1')
      .set('x-publisher-key', key)
      .send({
        tenantId: 'tenant-1',
        sourceModuleId: 'direct-module',
        channel: 'SMS',
        recipient: '+1234567890',
        templateIdentity: 'DirectTemplate',
        templateVersion: '1',
        correlationId,
      })
      .expect(202)
      .expect((res) => {
        expect(res.body.communicationId).toBeDefined();
        expect(res.body.deliveryId).toBeDefined();
        expect(res.body.status).toBe('QUEUED');
      });
  });
});
