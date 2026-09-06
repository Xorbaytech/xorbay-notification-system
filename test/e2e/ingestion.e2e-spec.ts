import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Event Ingestion (e2e)', () => {
  let app: INestApplication;
  const validKey = process.env.PUBLISHER_API_KEY ?? 'local-development-key';

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

  it('/api/v1/events (POST) - fails without publisher key', () => {
    return request(app.getHttpServer())
      .post('/api/v1/events')
      .set('x-tenant-id', 'tenant-1')
      .send({
        eventId: 'test-evt-1',
        eventType: 'AttendanceMarked',
        publisher: { moduleId: 'attendance', environment: 'production' },
        tenantId: 'tenant-1',
        aggregate: { id: 'agg-1', version: 1 },
        occurredAt: new Date().toISOString(),
        schemaVersion: '1.0',
        payload: { studentId: 'std-123' },
        correlationId: 'corr-1',
      })
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toEqual('PUBLISHER_AUTHENTICATION_FAILED');
      });
  });

  it('/api/v1/events (POST) - fails with invalid payload', () => {
    return request(app.getHttpServer())
      .post('/api/v1/events')
      .set('x-tenant-id', 'tenant-1')
      .set('x-publisher-key', validKey)
      .send({
        // Missing required fields
        eventId: 'test-evt-2',
      })
      .expect(400);
  });

  it('/api/v1/events (POST) - succeeds with valid payload', () => {
    const evtId = `test-evt-3-${Date.now()}`;
    return request(app.getHttpServer())
      .post('/api/v1/events')
      .set('x-tenant-id', 'tenant-1')
      .set('x-publisher-key', validKey)
      .send({
        eventId: evtId,
        eventType: 'AttendanceMarked',
        publisher: { moduleId: 'attendance', environment: 'production' },
        tenantId: 'tenant-1',
        aggregate: { id: 'agg-1', version: 1 },
        occurredAt: new Date().toISOString(),
        schemaVersion: '1.0',
        payload: { studentId: 'std-123' },
        correlationId: 'corr-1',
      })
      .expect(202)
      .expect((res) => {
        expect(res.body).toEqual({
          eventId: evtId,
          status: 'ACCEPTED',
          correlationId: 'corr-1',
        });
      });
  });
});
