import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import type { ManagedMessageChannel } from "../../protocol/src/message-channel.js";
import type { ProtocolMessage } from "../../protocol/src/protocol-event.js";
import { spawnStdioChannel } from "./stdio-channel.js";

const FIXTURE_SERVER = fileURLToPath(
  new URL("../../fixtures/src/echo-server.ts", import.meta.url),
);

const spawnedChannels: ManagedMessageChannel[] = [];

afterEach(async () => {
  await Promise.all(
    spawnedChannels.splice(0).map(async (channel) => channel.close()),
  );
});

function spawnChannel(
  args: readonly string[] = [FIXTURE_SERVER],
): ManagedMessageChannel {
  const channel = spawnStdioChannel({ command: process.execPath, args });
  spawnedChannels.push(channel);
  return channel;
}

function spawnInlineScript(source: string): ManagedMessageChannel {
  return spawnChannel(["--eval", source]);
}

async function request(
  channel: ManagedMessageChannel,
  message: ProtocolMessage,
): Promise<ProtocolMessage> {
  await channel.send(message);
  return channel.receive();
}

describe("spawnStdioChannel", () => {
  it("exchanges a request with a server process", async () => {
    const channel = spawnChannel();

    const response = await request(channel, {
      kind: "request",
      id: "initialize-1",
      method: "initialize",
    });

    expect(response).toEqual({
      kind: "response",
      id: "initialize-1",
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "flightdeck-fixture", version: "0.0.0" },
      },
    });
  });

  it("writes frames with the JSON-RPC version", async () => {
    const channel = spawnChannel();

    const response = await request(channel, {
      kind: "request",
      id: "reflect-1",
      method: "test/reflect",
    });

    expect(response).toEqual({
      kind: "response",
      id: "reflect-1",
      result: {
        jsonrpc: "2.0",
        id: "reflect-1",
        method: "test/reflect",
      },
    });
  });

  it("delivers a queued notification before its response", async () => {
    const channel = spawnChannel();

    await channel.send({
      kind: "request",
      id: "progress-1",
      method: "test/notify-then-respond",
    });

    await expect(channel.receive()).resolves.toEqual({
      kind: "notification",
      method: "notifications/progress",
      params: { progress: 1 },
    });
    await expect(channel.receive()).resolves.toEqual({
      kind: "response",
      id: "progress-1",
      result: { ok: true },
    });
  });

  it("keeps newlines inside a single frame", async () => {
    const channel = spawnChannel();

    const response = await request(channel, {
      kind: "request",
      id: "echo-1",
      method: "test/echo",
      params: { text: "first\nsecond" },
    });

    expect(response).toEqual({
      kind: "response",
      id: "echo-1",
      result: { text: "first\nsecond" },
    });
  });

  it("reports a frame that is not JSON", async () => {
    const channel = spawnInlineScript('process.stdout.write("not-json\\n")');

    await expect(channel.receive()).rejects.toThrow(/Invalid protocol frame/);
  });

  it("reports a frame that is not a protocol message", async () => {
    const channel = spawnInlineScript(
      'process.stdout.write(\'{"hello":"world"}\\n\')',
    );

    await expect(channel.receive()).rejects.toThrow(/Invalid protocol frame/);
  });

  it("rejects a pending read when the server exits", async () => {
    const channel = spawnInlineScript("process.exit(0)");

    await expect(channel.receive()).rejects.toThrow(/exited/);
  });

  it("rejects reads and writes after close", async () => {
    const channel = spawnChannel();

    await channel.close();

    await expect(channel.receive()).rejects.toThrow(/closed/i);
    await expect(
      channel.send({ kind: "notification", method: "notifications/cancelled" }),
    ).rejects.toThrow(/closed/i);
  });
});
