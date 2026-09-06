import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Management API — Templates, Recipients, Preferences, Rules (e2e)', () => {
  let app: INestApplication;
  const key = process.env.PUBLISHER_API_KEY ?? 'local-development-key';
  const tenant = 'e2e-mgmt-tenant';
  const module = 'e2e-mgmt-module';

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

  // ─── Templates ───────────────────────────────────────────────────────────────

  describe('Templates', () => {
    let templateId: string;

    it('POST /api/v1/templates — creates a template', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/templates')
        .set('x-publisher-key', key)
        .send({
          tenantId: tenant,
          sourceModuleId: module,
          eventType: 'TestEvent',
          identity: 'TestTemplate',
          version: 1,
          content: { subject: 'Hello', body: 'World' },
        });
      expect(res.status).toBe(201);
      expect(res.body.identity).toBe('TestTemplate');
      templateId = res.body.id;
    });

    it('GET /api/v1/templates — lists templates', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/templates?tenantId=${tenant}&sourceModuleId=${module}`)
        .set('x-publisher-key', key);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/templates/:id — fetches single template', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/templates/${templateId}?tenantId=${tenant}`)
        .set('x-publisher-key', key);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(templateId);
    });

    it('DELETE /api/v1/templates/:id — removes template', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/templates/${templateId}?tenantId=${tenant}`)
        .set('x-publisher-key', key)
        .expect(204);
    });
  });

  // ─── Recipients ──────────────────────────────────────────────────────────────

  describe('Recipients', () => {
    const recipientId = `e2e-recip-${Date.now()}`;

    it('POST /api/v1/recipients — creates a recipient', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/recipients')
        .set('x-publisher-key', key)
        .send({
          tenantId: tenant,
          sourceModuleId: module,
          recipientId,
          profile: { email: 'e2e@test.com', name: 'E2E User' },
        });
      expect(res.status).toBe(201);
      expect(res.body.recipientId).toBe(recipientId);
    });

    it('GET /api/v1/recipients — lists recipients', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/recipients?tenantId=${tenant}&sourceModuleId=${module}`)
        .set('x-publisher-key', key);
      expect(res.status).toBe(200);
      expect(res.body.some((r: any) => r.recipientId === recipientId)).toBe(true);
    });

    it('DELETE /api/v1/recipients/:id — removes recipient', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/recipients/${recipientId}?tenantId=${tenant}&sourceModuleId=${module}`)
        .set('x-publisher-key', key)
        .expect(204);
    });
  });

  // ─── Preferences ─────────────────────────────────────────────────────────────

  describe('Preferences', () => {
    const recipientId = `e2e-pref-recip-${Date.now()}`;
    let prefId: string;

    it('POST /api/v1/preferences — sets a preference', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/preferences')
        .set('x-publisher-key', key)
        .send({
          tenantId: tenant,
          sourceModuleId: module,
          recipientId,
          channel: 'EMAIL',
          decision: 'ALLOW',
        });
      expect(res.status).toBe(201);
      expect(res.body.decision).toBe('ALLOW');
      prefId = res.body.id;
    });

    it('GET /api/v1/preferences — lists preferences', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/preferences?tenantId=${tenant}&sourceModuleId=${module}&recipientId=${recipientId}`)
        .set('x-publisher-key', key);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('DELETE /api/v1/preferences/:id — removes preference', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/preferences/${prefId}?tenantId=${tenant}`)
        .set('x-publisher-key', key)
        .expect(204);
    });
  });

  // ─── Rules ───────────────────────────────────────────────────────────────────

  describe('Rules', () => {
    let sigId: string;
    let polId: string;

    it('POST /api/v1/rules/significance — creates significance rule', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/rules/significance')
        .set('x-publisher-key', key)
        .send({
          tenantId: tenant,
          sourceModuleId: module,
          eventType: 'E2ETestEvent',
          decision: 'NOTIFY',
          priority: 5,
        });
      expect(res.status).toBe(201);
      expect(res.body.decision).toBe('NOTIFY');
      sigId = res.body.id;
    });

    it('GET /api/v1/rules/significance — lists significance rules', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/rules/significance?tenantId=${tenant}&sourceModuleId=${module}`)
        .set('x-publisher-key', key);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/v1/rules/policy — creates policy rule', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/rules/policy')
        .set('x-publisher-key', key)
        .send({
          tenantId: tenant,
          sourceModuleId: module,
          eventType: 'E2ETestEvent',
          decision: 'ALLOWED',
          templateIdentity: 'E2ETemplate',
          templateVersion: 1,
        });
      expect(res.status).toBe(201);
      expect(res.body.decision).toBe('ALLOWED');
      polId = res.body.id;
    });

    it('GET /api/v1/rules/policy — lists policy rules', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/rules/policy?tenantId=${tenant}&sourceModuleId=${module}`)
        .set('x-publisher-key', key);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('DELETE /api/v1/rules/significance/:id — removes rule', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/rules/significance/${sigId}?tenantId=${tenant}`)
        .set('x-publisher-key', key)
        .expect(204);
    });

    it('DELETE /api/v1/rules/policy/:id — removes rule', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/rules/policy/${polId}?tenantId=${tenant}`)
        .set('x-publisher-key', key)
        .expect(204);
    });
  });
});
