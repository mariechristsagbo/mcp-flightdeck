import { describe, expect, it } from "vitest";

import type { ProtocolEvent } from "../../protocol/src/protocol-event.js";

import {
  createTraceDocument,
  serializeTraceDocument,
  type TraceDocument,
} from "./trace-document.js";

function createEvent(sequence: number, atMs: number): ProtocolEvent {
  return {
    sequence,
    atMs,
    direction: sequence % 2 === 0 ? "inbound" : "outbound",
    transport: {
      kind: "stdio",
    },
    message:
      sequence % 2 === 0
        ? {
            kind: "response",
            id: "initialize-1",
            result: {},
          }
        : {
            kind: "request",
            id: "initialize-1",
            method: "initialize",
          },
    redactions: [],
  };
}

describe("createTraceDocument", () => {
  it("creates a versioned completed trace with a derived duration", () => {
    const trace = createTraceDocument({
      id: "run_01",
      startedAt: "2026-09-15T08:00:00.000Z",
      status: "completed",
      events: [createEvent(1, 0), createEvent(2, 421)],
    });

    expect(trace).toEqual<TraceDocument>({
      formatVersion: 1,
      id: "run_01",
      startedAt: "2026-09-15T08:00:00.000Z",
      status: "completed",
      durationMs: 421,
      events: [createEvent(1, 0), createEvent(2, 421)],
    });
  });

  it("keeps interrupted traces serializable", () => {
    const trace = createTraceDocument({
      id: "run_02",
      startedAt: "2026-09-15T08:01:00.000Z",
      status: "interrupted",
      events: [createEvent(1, 0)],
    });

    expect(JSON.parse(serializeTraceDocument(trace))).toEqual(trace);
  });

  it("rejects event sequences with gaps", () => {
    expect(() =>
      createTraceDocument({
        id: "run_03",
        startedAt: "2026-09-15T08:02:00.000Z",
        status: "completed",
        events: [createEvent(1, 0), createEvent(3, 100)],
      }),
    ).toThrow("Trace events must have contiguous sequences beginning at 1.");
  });
});
