import { describe, expect, it } from "vitest";

import { createEventRecorder } from "./event-recorder.js";

describe("createEventRecorder", () => {
  it("turns observed protocol messages into ordered stdio events", () => {
    let now = 100;
    const recorder = createEventRecorder({
      clock: () => now,
      transport: { kind: "stdio" },
    });

    now = 125;
    recorder.record("outbound", {
      kind: "request",
      id: "initialize-1",
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
    now = 148;
    recorder.record("inbound", {
      kind: "response",
      id: "initialize-1",
      result: { protocolVersion: "2025-06-18" },
    });

    expect(recorder.events).toEqual([
      {
        sequence: 1,
        atMs: 25,
        direction: "outbound",
        transport: { kind: "stdio" },
        message: {
          kind: "request",
          id: "initialize-1",
          method: "initialize",
          params: { protocolVersion: "2025-06-18" },
        },
        redactions: [],
      },
      {
        sequence: 2,
        atMs: 48,
        direction: "inbound",
        transport: { kind: "stdio" },
        message: {
          kind: "response",
          id: "initialize-1",
          result: { protocolVersion: "2025-06-18" },
        },
        redactions: [],
      },
    ]);
  });
});
