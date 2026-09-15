import { describe, expect, expectTypeOf, it } from "vitest";

import { createProtocolEvent, type ProtocolEvent } from "./protocol-event.js";

describe("createProtocolEvent", () => {
  it("records an outbound initialize request with its transport context", () => {
    const event = createProtocolEvent({
      sequence: 1,
      atMs: 0,
      direction: "outbound",
      transport: {
        kind: "stdio",
      },
      message: {
        kind: "request",
        id: "initialize-1",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
        },
      },
      redactions: [],
    });

    expect(event).toEqual({
      sequence: 1,
      atMs: 0,
      direction: "outbound",
      transport: {
        kind: "stdio",
      },
      message: {
        kind: "request",
        id: "initialize-1",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
        },
      },
      redactions: [],
    });
    expectTypeOf(event).toEqualTypeOf<ProtocolEvent>();
  });

  it("records an inbound response", () => {
    const event = createProtocolEvent({
      sequence: 2,
      atMs: 43,
      direction: "inbound",
      transport: {
        kind: "streamable-http",
        requestId: "http-7",
      },
      message: {
        kind: "response",
        id: "initialize-1",
        result: {
          serverInfo: {
            name: "payments-mcp",
            version: "1.0.0",
          },
        },
      },
      redactions: [],
    });

    expect(event.message).toEqual({
      kind: "response",
      id: "initialize-1",
      result: {
        serverInfo: {
          name: "payments-mcp",
          version: "1.0.0",
        },
      },
    });
  });

  it("makes redaction evidence explicit", () => {
    const event = createProtocolEvent({
      sequence: 3,
      atMs: 71,
      direction: "outbound",
      transport: {
        kind: "sse",
      },
      message: {
        kind: "notification",
        method: "notifications/progress",
        params: {
          authorization: "[REDACTED]",
        },
      },
      redactions: [
        {
          path: "$.message.params.authorization",
          reason: "secret",
        },
      ],
    });

    expect(event.redactions).toEqual([
      {
        path: "$.message.params.authorization",
        reason: "secret",
      },
    ]);
  });
});
