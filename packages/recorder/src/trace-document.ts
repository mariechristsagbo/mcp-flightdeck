import type { ProtocolEvent } from "../../protocol/src/protocol-event.js";

export type TraceStatus = "completed" | "interrupted";

export type TraceDocument = Readonly<{
  durationMs: number;
  events: readonly ProtocolEvent[];
  formatVersion: 1;
  id: string;
  startedAt: string;
  status: TraceStatus;
}>;

export type CreateTraceDocumentInput = Readonly<{
  events: readonly ProtocolEvent[];
  id: string;
  startedAt: string;
  status: TraceStatus;
}>;

export function createTraceDocument(
  input: CreateTraceDocumentInput,
): TraceDocument {
  assertContiguousSequences(input.events);

  return {
    formatVersion: 1,
    id: input.id,
    startedAt: input.startedAt,
    status: input.status,
    durationMs: input.events.at(-1)?.atMs ?? 0,
    events: input.events,
  };
}

export function serializeTraceDocument(trace: TraceDocument): string {
  return JSON.stringify(trace, null, 2);
}

function assertContiguousSequences(events: readonly ProtocolEvent[]): void {
  for (const [index, event] of events.entries()) {
    if (event.sequence !== index + 1) {
      throw new Error(
        "Trace events must have contiguous sequences beginning at 1.",
      );
    }
  }
}
