export const TEMPLATE_ENGINE = Symbol('TEMPLATE_ENGINE');

export interface TemplateEnginePort {
  /**
   * Render a template with the given payload.
   *
   * @param templateId The unique identifier or fallback name for the template.
   * @param payload The dynamic data (business event payload) to inject.
   * @returns The rendered template as a string.
   */
  render(templateId: string, payload: any): Promise<string>;

  /**
   * Render with full routing context — resolves the Template row from the
   * database (tenant + event type + identity/version from the payload) and
   * returns subject + body separately. Falls back to the built-in templates
   * when no row matches, so unregistered events still deliver.
   */
  renderFor?(request: TemplateRenderRequest): Promise<RenderedContent>;
}

export interface TemplateRenderRequest {
  readonly tenantId: string;
  readonly sourceModuleId?: string;
  readonly eventType: string;
  /** Explicit template identity — e.g. the broadcast request's templateIdentity. */
  readonly identity?: string;
  readonly version?: number;
  readonly payload: Record<string, unknown>;
}

export interface RenderedContent {
  readonly subject?: string;
  readonly body: string;
  /** Identity of the template actually used ('fallback' when built-in). */
  readonly templateIdentity: string;
}
