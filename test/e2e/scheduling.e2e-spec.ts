import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DELIVERY_REPOSITORY } from '../../src/communication/persistence/ports/delivery-repository.port';

describe('Scheduling (e2e)', () => {
  let app: INestApplication;
  const publisherKey = process.env.PUBLISHER_API_KEY ?? 'local-development-key';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DELIVERY_REPOSITORY)
      .useValue({
        findById: jest.fn().mockResolvedValue({
          id: '00000000-0000-0000-0000-000000000000',
          tenantId: 'tenant-1',
          status: 'PENDING',
        }),
        findByCommunicationId: jest.fn().mockResolvedValue([]),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/schedules (POST) - fails with invalid data', () => {
    return request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set('x-publisher-key', publisherKey)
      .send({
        // missing fields
      })
      .expect(400);
  });

  it('/api/v1/schedules (POST) - succeeds with valid data', () => {
    return request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set('x-publisher-key', publisherKey)
      .send({
        tenantId: 'tenant-1',
        deliveryId: '00000000-0000-0000-0000-000000000000',
        mode: 'ONE_SHOT',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        timezone: 'UTC',
        correlationId: 'corr-1',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.status).toEqual('SCHEDULED');
      });
  });

  it('/api/v1/communications/:id/cancel (POST) - fails for non-existent', () => {
    return request(app.getHttpServer())
      .post('/api/v1/communications/00000000-0000-0000-0000-000000000000/cancel')
      .set('x-publisher-key', publisherKey)
      .send({
        tenantId: 'tenant-1',
        correlationId: 'corr-1',
      })
      .expect(404);
  });
});
