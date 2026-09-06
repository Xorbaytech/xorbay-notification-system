import { DbHandlebarsTemplateService } from './db-handlebars-template.service';

describe('DbHandlebarsTemplateService', () => {
  it('renders caller-supplied personalization tokens before the outer broadcast template', async () => {
    const prisma = {
      template: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new DbHandlebarsTemplateService(prisma as never);

    const result = await service.renderFor({
      tenantId: 'tenant-1',
      eventType: 'BROADCAST',
      identity: 'BroadcastNotification',
      payload: {
        title: 'Fee reminder',
        body: 'Hello {{recipientName}}, your {{subject}} payment is due.',
        recipientName: 'Arjun',
        subject: 'Mathematics',
      },
    });

    expect(result.subject).toBe('Fee reminder');
    expect(result.body).toContain('Hello Arjun, your Mathematics payment is due.');
    expect(result.body).not.toContain('{{recipientName}}');
    expect(prisma.template.findFirst).toHaveBeenCalledTimes(1);
  });
});
