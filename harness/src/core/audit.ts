/**
 * audit.ts — AuditEngine: append-only log of every decision, assertion and
 * exception across a close run (provenance, confidence, reason).
 */
import type { AuditEvent } from './types.js';
import { randomUUID } from 'node:crypto';

export class AuditEngine {
  private events: AuditEvent[] = [];

  constructor(private runId = '') {}

  setRunId(runId: string): void {
    this.runId = runId;
  }

  get all(): ReadonlyArray<AuditEvent> {
    return this.events;
  }

  clear(): void {
    this.events = [];
  }

  record(input: {
    actorType?: AuditEvent['actorType'];
    actorId?: string;
    action: string;
    recordId?: string;
    detail?: Record<string, unknown>;
  }): AuditEvent {
    const ev: AuditEvent = {
      id: `aud-${randomUUID()}`,
      runId: this.runId,
      actorType: input.actorType ?? 'SYSTEM',
      actorId: input.actorId ?? 'harness',
      action: input.action,
      recordId: input.recordId,
      detail: input.detail,
      createdAt: new Date().toISOString(),
    };
    this.events.push(ev);
    return ev;
  }

  count(): number {
    return this.events.length;
  }
}
