import { describe, expect, it } from "vitest";

import type {
  ProtocolEvent,
  ProtocolMessage,
} from "../../protocol/src/protocol-event.js";
import { REDACTED, redactTraceDocument } from "./redaction.js";
import { createTraceDocument } from "./trace-document.js";

function createTrace(message: ProtocolMessage) {
  const event: ProtocolEvent = {
    sequence: 1,
    atMs: 12,
    direction: "outbound",
    transport: { kind: "stdio" },
    message,
    redactions: [],
  };

  return createTraceDocument({
    id: "run_01",
    startedAt: "2026-09-15T08:00:00.000Z",
    status: "completed",
    events: [event],
  });
}

function redactMessage(message: ProtocolMessage) {
  return redactTraceDocument(createTrace(message)).events[0];
}

describe("redactTraceDocument", () => {
  it("redacts a sensitive key and reports where it was found", () => {
    const event = redactMessage({
      kind: "request",
      id: "call-1",
      method: "tools/call",
      params: {
        authorization: "Bearer aaa",
        email: "customer@example.com",
      },
    });

    expect(event?.message).toEqual({
      kind: "request",
      id: "call-1",
      method: "tools/call",
      params: {
        authorization: REDACTED,
        email: "customer@example.com",
      },
    });
    expect(event?.redactions).toEqual([
      {
        path: "$.events[0].message.params.authorization",
        reason: "sensitive",
      },
    ]);
  });

  it("redacts nested payloads and array entries", () => {
    const event = redactMessage({
      kind: "request",
      id: "call-1",
      method: "tools/call",
      params: {
        nested: { api_key: "abc123" },
        targets: [{ password: "hunter2" }],
      },
    });

    expect(event?.message).toEqual({
      kind: "request",
      id: "call-1",
      method: "tools/call",
      params: {
        nested: { api_key: REDACTED },
        targets: [{ password: REDACTED }],
      },
    });
    expect(event?.redactions).toEqual([
      {
        path: "$.events[0].message.params.nested.api_key",
        reason: "sensitive",
      },
      {
        path: "$.events[0].message.params.targets[0].password",
        reason: "sensitive",
      },
    ]);
  });

  it("redacts a credential-shaped value under an unrelated key", () => {
    const event = redactMessage({
      kind: "request",
      id: "call-1",
      method: "tools/call",
      params: { header: "Bearer abc123", scheme: "Basic Zm9vOmJhcg==" },
    });

    expect(event?.message).toEqual({
      kind: "request",
      id: "call-1",
      method: "tools/call",
      params: {
        header: `Bearer ${REDACTED}`,
        scheme: `Basic ${REDACTED}`,
      },
    });
    expect(event?.redactions).toEqual([
      {
        path: "$.events[0].message.params.header",
        reason: "secret",
      },
      {
        path: "$.events[0].message.params.scheme",
        reason: "secret",
      },
    ]);
  });

  it("redacts well-known token prefixes and server results", () => {
    const event = redactMessage({
      kind: "response",
      id: "call-1",
      result: {
        leakedKey: "sk-live-1234567890abcdef",
        pat: "github_pat_11ABCDEFG",
        summary: "no credentials here",
      },
    });

    expect(event?.message).toEqual({
      kind: "response",
      id: "call-1",
      result: {
        leakedKey: REDACTED,
        pat: REDACTED,
        summary: "no credentials here",
      },
    });
    expect(event?.redactions.map((redaction) => redaction.path)).toEqual([
      "$.events[0].message.result.leakedKey",
      "$.events[0].message.result.pat",
    ]);
  });

  it("redacts an error payload", () => {
    const event = redactMessage({
      kind: "error",
      id: "call-1",
      error: {
        code: -32000,
        message: "Unauthorized",
        data: { token: "abc123" },
      },
    });

    expect(event?.message).toEqual({
      kind: "error",
      id: "call-1",
      error: {
        code: -32000,
        message: "Unauthorized",
        data: { token: REDACTED },
      },
    });
    expect(event?.redactions).toEqual([
      {
        path: "$.events[0].message.error.data.token",
        reason: "sensitive",
      },
    ]);
  });

  it("preserves message identity, ordering, and clean payloads", () => {
    const trace = createTrace({
      kind: "notification",
      method: "notifications/progress",
      params: { progress: 50, note: "ok" },
    });

    const redacted = redactTraceDocument(trace);

    expect(redacted).toEqual(trace);
    expect(redacted.events[0]?.redactions).toEqual([]);
  });

  it("is idempotent", () => {
    const trace = createTrace({
      kind: "request",
      id: "call-1",
      method: "tools/call",
      params: { token: "abc123", header: "Bearer abc123" },
    });

    const once = redactTraceDocument(trace);
    const twice = redactTraceDocument(once);

    expect(twice).toEqual(once);
    expect(twice.events[0]?.redactions).toHaveLength(2);
  });
});
