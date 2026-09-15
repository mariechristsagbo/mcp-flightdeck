import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ManagedMessageChannel } from "../../protocol/src/message-channel.js";
import type { ProtocolMessage } from "../../protocol/src/protocol-event.js";
import {
  inspectChannel,
  inspectStdioServer,
  type InspectionReport,
} from "./inspect-server.js";

const FIXTURE_SERVER = fileURLToPath(
  new URL("../../fixtures/src/echo-server.ts", import.meta.url),
);

function createChannel(responses: readonly ProtocolMessage[]): {
  channel: ManagedMessageChannel;
  closeCalls: number;
  sent: ProtocolMessage[];
} {
  const pending = [...responses];
  const sent: ProtocolMessage[] = [];
  let closeCalls = 0;

  return {
    sent,
    get closeCalls() {
      return closeCalls;
    },
    channel: {
      async close() {
        closeCalls += 1;
      },
      async receive() {
        const response = pending.shift();
        if (response === undefined) {
          throw new Error("Channel closed.");
        }

        return response;
      },
      async send(message) {
        sent.push(message);
      },
    },
  };
}

const CLIENT_INFO = {
  name: "flightdeck",
  version: "0.0.0",
};

describe("inspectChannel", () => {
  it("discovers only the capabilities negotiated by the server", async () => {
    const fake = createChannel([
      {
        kind: "response",
        id: "initialize-1",
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "test-server", version: "1.0.0" },
        },
      },
      {
        kind: "response",
        id: "tools-list-2",
        result: {
          tools: [{ name: "echo", inputSchema: { type: "object" } }],
        },
      },
    ]);

    const report = await inspectChannel(fake.channel, {
      clientInfo: CLIENT_INFO,
      requestTimeoutMs: 100,
    });

    expect(report).toEqual<InspectionReport>({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "test-server", version: "1.0.0" },
      tools: [{ name: "echo", inputSchema: { type: "object" } }],
    });
    expect(fake.sent).toEqual([
      {
        kind: "request",
        id: "initialize-1",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: CLIENT_INFO,
        },
      },
      {
        kind: "notification",
        method: "notifications/initialized",
      },
      {
        kind: "request",
        id: "tools-list-2",
        method: "tools/list",
      },
    ]);
    expect(fake.closeCalls).toBe(1);
  });

  it("closes the channel when a request times out", async () => {
    let closeCalls = 0;
    const channel: ManagedMessageChannel = {
      async close() {
        closeCalls += 1;
      },
      async receive() {
        return new Promise<ProtocolMessage>(() => {});
      },
      async send() {},
    };

    await expect(
      inspectChannel(channel, {
        clientInfo: CLIENT_INFO,
        requestTimeoutMs: 1,
      }),
    ).rejects.toThrow("Timed out waiting for initialize.");
    expect(closeCalls).toBe(1);
  });
});

describe("inspectStdioServer", () => {
  it("inspects the real stdio fixture server", async () => {
    const report = await inspectStdioServer({
      command: process.execPath,
      args: [FIXTURE_SERVER],
      clientInfo: CLIENT_INFO,
      requestTimeoutMs: 5_000,
    });

    expect(report.protocolVersion).toBe("2025-06-18");
    expect(report.serverInfo).toEqual({
      name: "flightdeck-fixture",
      version: "0.0.0",
    });
    expect(report.tools).toEqual([
      {
        name: "echo",
        description: "Echoes the provided arguments.",
        inputSchema: { type: "object" },
      },
    ]);
  });
});
