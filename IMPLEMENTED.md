# Notification Platform Microservice — Implementation Guide

This document describes the complete architecture, implementation details, operational configurations, and deployment strategies developed for the Notification Platform microservice.

---

## 1. System Architecture Overview

The Notification Platform is an enterprise-grade, asynchronous communication engine designed to handle transactional, scheduled, and bulk notifications across multiple channels (`EMAIL`, `IN_APP`, `WHATSAPP`).

```
┌─────────────────────────────────────────────────────────────┐
│                    Upstream Services                        │
│             (ERP, Attendance, Core Modules)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP POST /api/v1/events
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Ingestion Layer                   │
│   - Publisher Authentication (x-publisher-key)              │
│   - Schema Validation & Idempotency Check                   │
│   - Outbox Event Table Storage (Neon PostgreSQL)            │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌────────────────────────┐            ┌────────────────────────┐
│   Outbox Relay Cron    │            │   Direct Deliveries    │
│  (Batched DB -> Queue) │            │ (Immediate Expedited)  │
└───────────┬────────────┘            └───────────┬────────────┘
            │                                     │
            ▼                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     BullMQ Queue Layer                      │
│                    (Redis Container / Cloud)                │
│   ├── delivery-queue          (Standard Priority)           │
│   ├── critical-delivery-queue (High Priority / Immediate)   │
│   └── bulk-delivery-queue     (Batched Broadcasts)          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Delivery Worker Processes                  │
│   ├── Email Worker (SMTP Adapter)                           │
│   └── ERP Webhook Worker (Signed HTTP Callbacks + Gate)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Implementation Modules

### A. Business Event Ingestion (`API-01`)
- **Route**: `POST /api/v1/events`
- **Authentication**: Validated via `x-publisher-key` HTTP header against registered publisher secrets.
- **Idempotency**: Every event is tracked by `eventId` and `correlationId` to ensure at-most-once processing.
- **Response**: Immediate `202 Accepted` acknowledgment, writing the raw event to the transactional Outbox table.

### B. Outbox Relay & Reliability Pattern
- **Component**: `OutboxRelayCron` (`src/communication/infrastructure/cron/outbox-relay.cron.ts`)
- **Mechanism**:
  1. Periodically queries un-submitted outbox records with lease locks (`claimRows`).
  2. Submits batches to BullMQ queues using `addBulk`.
  3. Updates publication status atomically in PostgreSQL.
- **Benefits**: Prevents data loss during network spikes or worker crashes; decoupled API ingestion from delivery processing.

### C. Queue System & Worker Concurrency (BullMQ + Redis)
- **Queues**:
  - `delivery`: Standard transactional deliveries (`CONCURRENCY=4`).
  - `critical-delivery`: SLA-sensitive notifications (`CONCURRENCY=2`).
  - `bulk-delivery`: Mass broadcast batches (`CONCURRENCY=2`).
- **Adapter**: `BullmqDeliveryQueueAdapter` maps application-level delivery intents to resilient Redis jobs with automatic retries (3 attempts with exponential backoff).

### D. Dead-Letter Queue (DLQ) & Reconciliation
- Failed messages after max retry attempts are pushed to the Dead Letter Queue.
- **API Management**:
  - `GET /api/v1/dlq`: List dead-letter items.
  - `POST /api/v1/dlq/:id/requeue`: Replay poisoned or failed notifications after upstream fixes.

---

## 3. Database Architecture & Neon PostgreSQL Integration

### Database Engine & ORM
- **ORM**: Prisma v7 (`@prisma/client` + `@prisma/adapter-pg`).
- **Driver**: `node-postgres` (`pg` Connection Pool).
- **Cloud Database**: Neon Serverless PostgreSQL (`ap-southeast-1`).

### Critical Neon Cloud Connection Insights
Neon uses a two-tier connection model:
1. **Direct Connection (`ep-rough-leaf-b3t133vu.c-4...`)**:
   - Direct connection to PostgreSQL compute instance.
   - **Required for Prisma Migrations & Long-running Transactions**: Migration DDL and Prisma interactive transactions require session-level locking, which can timeout or fail on PgBouncer.
2. **Pooler Connection (`ep-rough-leaf-b3t133vu-pooler.c-4...`)**:
   - Connection through PgBouncer for high-frequency stateless queries.
3. **Channel Binding Parameter (`channel_binding=require`)**:
   - Removed from URL because standard Node.js OpenSSL and Prisma engines require specific SASL flags; omitting it allows standard TLS encryption (`sslmode=require`) without connection drops.

### Database Connection Pool Configuration (`prisma.module.ts`)
To prevent `ETIMEDOUT` errors with cloud databases during background cron polling, an explicit `pg.Pool` was configured:
```typescript
const pool = new Pool({
  connectionString,
  max: 20,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 30000,
  ssl: isCloudPostgres ? { rejectUnauthorized: false } : undefined,
});
const adapter = new PrismaPg(pool);
return new PrismaClient({ adapter });
```

---

## 4. Docker Architecture & Container Orchestration

### Multi-Stage `Dockerfile`
A multi-stage build creates a hardened, lightweight production image:
- **Stage 1 (`builder`)**:
  - Installs full `devDependencies` (`typescript`, `@nestjs/cli`).
  - Generates Prisma client.
  - Compiles TypeScript to `dist/`.
- **Stage 2 (`production runtime`)**:
  - Lightweight `node:22-alpine` base.
  - Installs only production dependencies (`npm ci --omit=dev`).
  - Copies compiled `dist/` from builder.
  - Starts app directly: `CMD ["node", "dist/src/main.js"]`.

### `docker-compose.yml` Stack
```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3002:3002"
    env_file:
      - .env
    environment:
      - PORT=3002
      - NODE_ENV=production
      - DATABASE_URL=postgresql://neondb_owner:npg_mLcBy7urWM0R@ep-rough-leaf-b3t133vu.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

---

## 5. Vercel & CI/CD Deployment

### Vercel Serverless Function Adapter (`api/index.ts`)
Vercel requires an exported HTTP handler instead of a long-running `app.listen()` daemon:
```typescript
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from '../src/app.module';

const server = express();
let isAppInitialized = false;

async function bootstrapServer() {
  if (!isAppInitialized) {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server), { rawBody: true });
    app.enableShutdownHooks();
    app.setGlobalPrefix('api/v1');
    await app.init();
    isAppInitialized = true;
  }
  return server;
}

export default async function handler(req, res) {
  await bootstrapServer();
  server(req, res);
}
```

### GitHub Actions Workflow (`.github/workflows/deploy-vercel.yml`)
Automates the build and deployment pipeline on push to `main`:
1. Checks out repository and installs Node 20 dependencies.
2. Runs `npx prisma generate` with `DATABASE_URL`.
3. Compiles the NestJS project (`npm run build`).
4. Pulls Vercel environment configurations using `VERCEL_TOKEN`.
5. Deploys production bundle directly to Vercel.

> [!IMPORTANT]
> **Serverless Limitation Notice**:
> Vercel instances freeze when there are no incoming requests. Therefore, while Vercel runs the REST API effectively, **BullMQ workers and Cron jobs require a persistent process** (e.g., Docker container on Railway, Render, Fly.io, or AWS ECS).

---

## 6. Environment Variables Reference

| Variable | Description | Example / Production Setting |
| :--- | :--- | :--- |
| `PORT` | Local HTTP listen port | `3002` |
| `DATABASE_URL` | Neon PostgreSQL connection string | `postgresql://user:pass@host/db?sslmode=require` |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379` (Docker) or `rediss://...` (Upstash) |
| `PUBLISHER_API_KEY` | Secret required for `/api/v1/events` ingestion | `prod-secret-key-...` |
| `ERP_API_URL` | Base URL for ERP callback webhooks | `http://localhost:3001` or `https://erp.domain.com` |
| `ERP_CALLBACK_SECRET` | HMAC signature secret for outgoing webhooks | `local-dev-callback-secret` |
| `DELIVERY_WORKER_CONCURRENCY` | Concurrency for standard worker | `4` |
| `CRITICAL_WORKER_CONCURRENCY` | Concurrency for critical priority queue | `2` |
| `BULK_WORKER_CONCURRENCY` | Concurrency for bulk broadcasts | `2` |

---

## 7. Verification & Operational Testing

### Start Container Stack
```bash
docker compose up -d app redis
```

### View Live Logs
```bash
docker compose logs -f app
```
*Expected log output:*
```text
[NestApplication] Nest application successfully started
[OutboxMetricsCron] Outbox queue depth: 0
```

### Ingest Test Event
```bash
curl -X POST http://localhost:3002/api/v1/events \
  -H "Content-Type: application/json" \
  -H "x-publisher-key: local-development-key" \
  -d '{
    "eventId": "evt_test_001",
    "eventType": "AttendanceMarked",
    "publisher": {
      "moduleId": "attendance",
      "environment": "production"
    },
    "tenantId": "tenant_123",
    "aggregate": {
      "id": "student_456",
      "version": 1
    },
    "occurredAt": "2026-09-12T01:00:00Z",
    "schemaVersion": "1.0",
    "payload": {
      "studentId": "student_456",
      "attendanceStatus": "ABSENT"
    },
    "correlationId": "corr_test_001"
  }'
```

### Response
```json
{
  "eventId": "evt_test_001",
  "status": "ACCEPTED",
  "correlationId": "corr_test_001"
}
```
