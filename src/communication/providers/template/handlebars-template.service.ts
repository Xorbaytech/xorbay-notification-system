import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { TemplateEnginePort } from './template-engine.port';

@Injectable()
export class HandlebarsTemplateService implements TemplateEnginePort {
  // In a real system, these templates would be fetched from the database based on templateId.
  // For the MVP, we use hardcoded basic templates for quick validation.
  private templates: Record<string, HandlebarsTemplateDelegate> = {
    'fallback': Handlebars.compile(`Hello! An event occurred. Details: {{payload.studentId}} (Aggregate: {{aggregate.id}}).`),
    'AttendanceMarked': Handlebars.compile(`Hello, attendance has been marked for student {{payload.studentId}}.`),
    'GradeUpdated': Handlebars.compile(`Hello, the grade for student {{payload.studentId}} has been updated to {{payload.grade}}.`),
  };

  async render(templateId: string, payload: any): Promise<string> {
    const template = this.templates[templateId] || this.templates['fallback'];
    return template(payload);
  }
}
