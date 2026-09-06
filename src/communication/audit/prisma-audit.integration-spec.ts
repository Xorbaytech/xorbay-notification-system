import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaAuditRepository } from './prisma-audit.repository';

const loadLocalDatabaseUrl = (): void => {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find((entry) => entry.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
  process.env.DATABASE_URL = line.slice(line.indexOf('=') + 1).trim().replace(/^['\"]|['\"]$/g, '');
};

describe('PostgreSQL audit persistence', () => {
  let prisma: PrismaClient;
  let repository: PrismaAuditRepository;

  beforeAll(() => {
    loadLocalDatabaseUrl();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    repository = new PrismaAuditRepository(prisma);
  });

  afterAll(async () => prisma.$disconnect());

  it('persists a reconstructable business significance decision', async () => {
    const correlationId = randomUUID();
    await repository.recordBusinessSignificance({
      tenantId: `tenant_${correlationId}`,
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      sourceEventId: `evt_${correlationId}`,
      correlationId,
      decision: 'NOTIFY',
      reason: 'Attendance requires notification',
    });

    const record = await prisma.auditRecord.findFirst({ where: { correlationId } });

    expect(record).not.toBeNull();
    expect(record?.tenantId).toBe(`tenant_${correlationId}`);
    expect(record?.eventType).toBe('BUSINESS_SIGNIFICANCE');
    expect(record?.actorType).toBe('SYSTEM');
    expect(record?.decision).toBe('NOTIFY');
    expect(record?.reasonCode).toBe('Attendance requires notification');
    expect(record?.metadata).toEqual({
      sourceModuleId: 'attendance',
      sourceEventType: 'AttendanceMarked',
      sourceEventId: `evt_${correlationId}`,
    });

    await prisma.auditRecord.delete({ where: { id: record!.id } });
  });

  it('keeps audit history when lifecycle entities are absent', async () => {
    const correlationId = randomUUID();
    await repository.recordBusinessSignificance({
      tenantId: `tenant_${correlationId}`,
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      sourceEventId: `evt_${correlationId}`,
      correlationId,
      decision: 'IGNORE',
      reason: 'No communication required',
    });

    const count = await prisma.auditRecord.count({ where: { correlationId } });
    expect(count).toBe(1);

    await prisma.auditRecord.deleteMany({ where: { correlationId } });
  });
});
