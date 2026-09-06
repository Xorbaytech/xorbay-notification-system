import { FakeRecipientFixture } from '../../../communication/recipient/fakes/fake-recipient.resolver';
import { FakePreferenceFixture } from '../../../communication/recipient/fakes/fake-preference.resolver';
import { FakeTemplateFixture } from '../../../communication/template/fakes/fake-template.repository';

export const MVP_RECIPIENT_FIXTURES: FakeRecipientFixture[] = [
  {
    tenantId: 'tenant-fixture',
    sourceModuleId: 'attendance-fixture',
    recipients: [{ recipientId: 'student-001', name: 'John Doe', language: 'en' }],
  },
];

export const MVP_PREFERENCE_FIXTURES: FakePreferenceFixture[] = [
  {
    tenantId: 'tenant-fixture',
    sourceModuleId: 'attendance-fixture',
    recipientId: 'student-001',
    channel: 'EMAIL',
    decision: 'ALLOW',
  },
];

export const MVP_TEMPLATE_FIXTURES: FakeTemplateFixture[] = [
  {
    tenantId: 'tenant-fixture',
    sourceModuleId: 'attendance-fixture',
    eventType: 'AttendanceMarked',
    templateIdentity: 'AttendanceMarked', // Or whatever identity comes from policy
    version: 1,
    renderedContent: {
      subject: 'Your Attendance Update',
      body: 'Hello, your attendance was marked. Please check the portal.',
    },
  },
];
