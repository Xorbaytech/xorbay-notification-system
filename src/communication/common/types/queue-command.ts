export interface QueueCommand {
  readonly stableJobKey: string;
  readonly workType: string;
  readonly logicalWorkId: string;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly schemaVersion: string;
  /** BullMQ priority: lower numbers are processed first. */
  readonly priority?: number;
}

export interface QueueAcceptance {
  readonly jobId: string;
}
