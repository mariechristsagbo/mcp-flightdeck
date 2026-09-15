#!/usr/bin/env node
/**
 * Minimal MCP server over stdio, used by transport tests.
 *
 * It is deliberately dependency-free and self-contained: Node runs it through
 * type stripping, so it must not import other project modules and must only use
 * erasable TypeScript syntax.
 *
 * Supported methods:
 * - `initialize` — replies with a fixed handshake result.
 * - `tools/list` — replies with a single `echo` tool.
 * - `test/echo` — replies with the received params.
 * - `test/notify-then-respond` — writes a progress notification, then replies.
 *
 * Any other request receives a `-32601` JSON-RPC error. Notifications are
 * accepted and ignored.
 */

const PROTOCOL_VERSION = "2025-06-18";
const METHOD_NOT_FOUND = -32601;

type JsonObject = Record<string, unknown>;

function write(message: JsonObject): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id: unknown, result: unknown): void {
  write({ jsonrpc: "2.0", id, result });
}

function replyError(id: unknown, code: number, message: string): void {
  write({ jsonrpc: "2.0", id, error: { code, message } });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function handleMessage(message: JsonObject): void {
  const method = message.method;
  const id = message.id;
  const params = message.params;

  if (typeof method !== "string") {
    return;
  }

  if (id === undefined) {
    return;
  }

  if (method === "initialize") {
    reply(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "flightdeck-fixture", version: "0.0.0" },
    });
    return;
  }

  if (method === "tools/list") {
    reply(id, {
      tools: [
        {
          name: "echo",
          description: "Echoes the provided arguments.",
          inputSchema: { type: "object" },
        },
      ],
    });
    return;
  }

  if (method === "test/reflect") {
    reply(id, message);
    return;
  }

  if (method === "test/echo") {
    reply(id, isObject(params) ? params : {});
    return;
  }

  if (method === "test/notify-then-respond") {
    write({
      jsonrpc: "2.0",
      method: "notifications/progress",
      params: { progress: 1 },
    });
    reply(id, { ok: true });
    return;
  }

  replyError(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
}

let buffered = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffered += chunk;

  for (;;) {
    const newlineIndex = buffered.indexOf("\n");
    if (newlineIndex === -1) {
      return;
    }

    const line = buffered.slice(0, newlineIndex);
    buffered = buffered.slice(newlineIndex + 1);

    if (line.trim() === "") {
      continue;
    }

    const parsed: unknown = JSON.parse(line);
    if (isObject(parsed)) {
      handleMessage(parsed);
    }
  }
});
