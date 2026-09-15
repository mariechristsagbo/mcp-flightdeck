import { describe, expect, it } from "vitest";

import { decodeJsonRpcMessage, encodeJsonRpcMessage } from "./json-rpc-wire.js";

describe("decodeJsonRpcMessage", () => {
  it("decodes a request with params", () => {
    expect(
      decodeJsonRpcMessage({
        jsonrpc: "2.0",
        id: "initialize-1",
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      }),
    ).toEqual({
      kind: "request",
      id: "initialize-1",
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
  });

  it("decodes a request without params", () => {
    const message = decodeJsonRpcMessage({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/list",
    });

    expect(message).toEqual({ kind: "request", id: 7, method: "tools/list" });
    expect(message).not.toHaveProperty("params");
  });

  it("decodes a response", () => {
    expect(
      decodeJsonRpcMessage({
        jsonrpc: "2.0",
        id: "initialize-1",
        result: { serverInfo: { name: "payments-mcp", version: "1.0.0" } },
      }),
    ).toEqual({
      kind: "response",
      id: "initialize-1",
      result: { serverInfo: { name: "payments-mcp", version: "1.0.0" } },
    });
  });

  it("decodes a notification", () => {
    expect(
      decodeJsonRpcMessage({
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { progress: 50 },
      }),
    ).toEqual({
      kind: "notification",
      method: "notifications/progress",
      params: { progress: 50 },
    });
  });

  it("decodes an error response", () => {
    expect(
      decodeJsonRpcMessage({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32601,
          message: "Method not found",
          data: { method: "nope" },
        },
      }),
    ).toEqual({
      kind: "error",
      id: null,
      error: {
        code: -32601,
        message: "Method not found",
        data: { method: "nope" },
      },
    });
  });

  it("rejects a value that is not a JSON-RPC message", () => {
    expect(decodeJsonRpcMessage({ hello: "world" })).toBeNull();
    expect(
      decodeJsonRpcMessage({ jsonrpc: "1.0", method: "initialize" }),
    ).toBeNull();
    expect(decodeJsonRpcMessage({ jsonrpc: "2.0", id: 1 })).toBeNull();
    expect(
      decodeJsonRpcMessage({ jsonrpc: "2.0", id: 1, method: 2 }),
    ).toBeNull();
    expect(decodeJsonRpcMessage("not a message")).toBeNull();
  });
});

describe("encodeJsonRpcMessage", () => {
  it("encodes a request and omits absent params", () => {
    expect(
      encodeJsonRpcMessage({
        kind: "request",
        id: "tools-1",
        method: "tools/list",
      }),
    ).toEqual({ jsonrpc: "2.0", id: "tools-1", method: "tools/list" });

    expect(
      encodeJsonRpcMessage({
        kind: "request",
        id: "tools-1",
        method: "tools/call",
        params: { name: "search_customer" },
      }),
    ).toEqual({
      jsonrpc: "2.0",
      id: "tools-1",
      method: "tools/call",
      params: { name: "search_customer" },
    });
  });

  it("encodes a response, a notification, and an error response", () => {
    expect(
      encodeJsonRpcMessage({ kind: "response", id: 1, result: { ok: true } }),
    ).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });

    expect(
      encodeJsonRpcMessage({
        kind: "notification",
        method: "notifications/cancelled",
      }),
    ).toEqual({ jsonrpc: "2.0", method: "notifications/cancelled" });

    expect(
      encodeJsonRpcMessage({
        kind: "error",
        id: 1,
        error: { code: -32601, message: "Method not found" },
      }),
    ).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Method not found" },
    });
  });

  it("round-trips a decoded message", () => {
    const wire = {
      jsonrpc: "2.0",
      id: "call-1",
      method: "tools/call",
      params: { name: "search_customer", arguments: { email: "a@b.c" } },
    };

    const message = decodeJsonRpcMessage(wire);
    expect(message).not.toBeNull();

    if (message === null) {
      throw new Error("Expected the frame to decode.");
    }

    expect(encodeJsonRpcMessage(message)).toEqual(wire);
  });
});
