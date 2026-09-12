# Communication & Notification Platform — Microservice

A high-throughput, fault-tolerant communication and notification platform built with **NestJS**, **Prisma ORM**, **Neon PostgreSQL**, and **BullMQ (Redis)**.

---

## Architecture Overview

- **Runtime & Framework**: NestJS (TypeScript, Node.js 22)
- **Database**: PostgreSQL (Neon Serverless PostgreSQL with connection pooling & `@prisma/adapter-pg`)
- **Queue & Workers**: BullMQ powered by Redis for reliable, asynchronous notification deliveries
- **Delivery Channels**:
  - `EMAIL` (SMTP)
  - `IN_APP` (ERP webhook callbacks)
  - `WHATSAPP` (ERP webhook callbacks)
- **Reliability & Resilience**: Outbox relay pattern, dead letter queue (DLQ), rate limiting gates, and tenant preference routing.
- **Monitoring**: Prometheus metrics exported at `/api/v1/metrics`.

---

## Quick Start (Docker Compose) — Recommended

The easiest way to run the platform locally with Redis and your Neon PostgreSQL database:

### 1. Configure Environment Variables
Ensure `.env` contains your Neon `DATABASE_URL`:
```env
PORT=3002
DATABASE_URL="postgresql://neondb_owner:npg_mLcBy7urWM0R@ep-rough-leaf-b3t133vu-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
PUBLISHER_API_KEY=local-development-key
REDIS_URL=redis://redis:6379
```

### 2. Build and Start Services
```bash
docker compose up -d --build app redis
```

### 3. Verify Health & Logs
```bash
# View real-time logs
docker compose logs -f app

# Check status of running containers
docker compose ps

# Test Prometheus health endpoint
curl http://localhost:3002/api/v1/metrics
```

### 4. Stop Services
```bash
docker compose down
```

---

## Local Development (Without Docker)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure `.env`
```bash
cp .env.example .env
```
Ensure a Redis instance is running locally on port `6379` (`REDIS_HOST=localhost`, `REDIS_PORT=6379`).

### 3. Apply Prisma Migrations
```bash
# Apply migrations to database
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### 4. Build and Run
```bash
# Development watch mode
npm run start:dev

# Production build
npm run build
npm start
```
The API listens on `http://localhost:3002` with global prefix `/api/v1`.

---

## Deployment Options

### Option A: Container Deployment (Railway / Render / AWS ECS / Fly.io)
Because this microservice runs persistent **BullMQ workers** and scheduled **Outbox crons**, container platforms provide the best production environment.
Use the included [`Dockerfile`](file:///Users/priyanshu/Desktop/priyanshu/xorbay/admin/Notification-System/9.0-Implementation/Dockerfile) to deploy directly.

### Option B: Vercel (API Layer) via GitHub Actions
A GitHub Actions workflow ([`.github/workflows/deploy-vercel.yml`](file:///Users/priyanshu/Desktop/priyanshu/xorbay/admin/Notification-System/9.0-Implementation/.github/workflows/deploy-vercel.yml)) and serverless entrypoint ([`api/index.ts`](file:///Users/priyanshu/Desktop/priyanshu/xorbay/admin/Notification-System/9.0-Implementation/api/index.ts)) are included.

1. Add the following GitHub Repository Secrets (**Settings → Secrets and variables → Actions**):
   - `VERCEL_TOKEN`: Vercel Personal Access Token.
   - `VERCEL_ORG_ID`: Vercel Team / Account ID.
   - `VERCEL_PROJECT_ID`: Vercel Project ID.
   - `DATABASE_URL`: Your Neon PostgreSQL direct or pooled URL.
2. Push to the `main` branch to trigger automated deployment.

> [!NOTE]
> On Vercel serverless functions, background workers and persistent crons do not run continuously. For active background processing, run a worker container or trigger workers via external cron/webhooks.

---

## Core API Endpoints

All endpoints are prefixed with `/api/v1`:

| Method | Endpoint | Description | Auth Header |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/events` | Ingest upstream business events (Outbox flow) | `x-publisher-key` |
| `POST` | `/api/v1/direct` | Send immediate transactional notifications | `x-publisher-key` |
| `POST` | `/api/v1/broadcasts` | Trigger bulk broadcast campaigns | `x-publisher-key` |
| `GET` | `/api/v1/dlq` | List dead-letter queue failed messages | `x-publisher-key` |
| `POST` | `/api/v1/dlq/:id/requeue` | Requeue a dead-letter item | `x-publisher-key` |
| `POST` | `/api/v1/management/register-publisher` | Register a new upstream publisher module | `x-publisher-key` |
| `GET` | `/api/v1/metrics` | Prometheus metrics and health status | None |

### Sample Request: Business Event Ingestion (`API-01`)

**Headers**:
```http
Content-Type: application/json
x-publisher-key: local-development-key
```

**Request**:
```json
{
  "eventId": "evt_01JXXXXXXXXXXXX",
  "eventType": "AttendanceMarked",
  "publisher": {
    "moduleId": "attendance",
    "environment": "production"
  },
  "tenantId": "tenant_123",
  "aggregate": {
    "id": "student_456",
    "version": 17
  },
  "occurredAt": "2026-08-10T05:30:00Z",
  "schemaVersion": "1.0",
  "payload": {
    "studentId": "student_456",
    "attendanceStatus": "ABSENT"
  },
  "correlationId": "corr_01JXXXXXXXXXXXX"
}
```

**Response (`202 Accepted`)**:
```json
{
  "eventId": "evt_01JXXXXXXXXXXXX",
  "status": "ACCEPTED",
  "correlationId": "corr_01JXXXXXXXXXXXX"
}
```

---

## Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```
