import { PersonalizeContentUseCase } from './personalize-content.use-case';
import { PersonalizationPort } from './personalization.port';

describe('PersonalizeContentUseCase', () => {
  const command = {
    tenantId: 'tenant_001',
    sourceModuleId: 'attendance',
    eventType: 'AttendanceMarked',
    sourceEventId: 'evt_personalization_001',
    correlationId: 'corr_personalization_001',
    renderedContent: {
      subject: 'Attendance update',
      body: 'Attendance status: ABSENT',
    },
    recipient: {
      recipientId: 'student_001',
    },
  };

  it('applies recipient-specific personalization and returns finalized content', async () => {
    const personalization: PersonalizationPort = {
      personalize: jest.fn().mockResolvedValue({
        finalizedContent: {
          subject: 'Attendance update for student_001',
          body: 'Attendance status: ABSENT',
        },
      }),
    };

    const useCase = new PersonalizeContentUseCase(personalization);

    const result = await useCase.execute(command);

    expect(personalization.personalize).toHaveBeenCalledWith(command);
    expect(result).toEqual({
      finalizedContent: {
        subject: 'Attendance update for student_001',
        body: 'Attendance status: ABSENT',
      },
    });
  });

  it('does not invent personalization when the adapter returns the rendered content unchanged', async () => {
    const renderedContent = {
      subject: 'Attendance update',
      body: 'Attendance status: ABSENT',
    };
    const personalization: PersonalizationPort = {
      personalize: jest.fn().mockResolvedValue({ finalizedContent: renderedContent }),
    };

    const useCase = new PersonalizeContentUseCase(personalization);

    await expect(
      useCase.execute({ ...command, renderedContent }),
    ).resolves.toEqual({ finalizedContent: renderedContent });
  });

  it('propagates personalization failures', async () => {
    const personalization: PersonalizationPort = {
      personalize: jest.fn().mockRejectedValue(new Error('PERSONALIZATION_FAILED')),
    };

    const useCase = new PersonalizeContentUseCase(personalization);

    await expect(useCase.execute(command)).rejects.toThrow('PERSONALIZATION_FAILED');
  });
});
