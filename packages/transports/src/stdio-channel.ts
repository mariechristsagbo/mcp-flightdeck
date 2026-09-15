import { spawn } from "node:child_process";
import type { Writable } from "node:stream";

import {
  decodeJsonRpcMessage,
  encodeJsonRpcMessage,
} from "../../protocol/src/json-rpc-wire.js";
import type { ManagedMessageChannel } from "../../protocol/src/message-channel.js";
import type { ProtocolMessage } from "../../protocol/src/protocol-event.js";

export type StdioChannelOptions = Readonly<{
  args?: readonly string[];
  command: string;
  cwd?: string;
  env?: Readonly<Record<string, string>>;
}>;

type Waiter = Readonly<{
  reject: (error: Error) => void;
  resolve: (message: ProtocolMessage) => void;
}>;

/**
 * Run an MCP server as a child process and exchange newline-delimited JSON-RPC
 * frames with it.
 *
 * Frames are decoded before they leave this module, so a malformed or
 * non-protocol frame is reported as a channel failure instead of reaching a
 * trace as a validated message. A server that exits — or that writes a frame
 * nobody can read — fails every pending and future read rather than leaving a
 * replay waiting forever.
 */
export function spawnStdioChannel(
  options: StdioChannelOptions,
): ManagedMessageChannel {
  const child = spawn(options.command, [...(options.args ?? [])], {
    cwd: options.cwd,
    env:
      options.env === undefined
        ? undefined
        : { ...process.env, ...options.env },
    stdio: "pipe",
  });

  const buffered: ProtocolMessage[] = [];
  const waiters: Waiter[] = [];
  let failure: Error | null = null;
  let pendingFrame = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    pendingFrame += chunk;

    for (;;) {
      const newlineIndex = pendingFrame.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }

      const frame = pendingFrame.slice(0, newlineIndex);
      pendingFrame = pendingFrame.slice(newlineIndex + 1);
      acceptFrame(frame);
    }
  });

  child.on("exit", (code, signal) => {
    fail(
      new Error(
        `MCP server process exited before a message arrived (code: ${String(code)}, signal: ${String(signal)}).`,
      ),
    );
  });

  child.on("error", (error) => {
    fail(error);
  });

  function acceptFrame(frame: string): void {
    if (frame.trim() === "") {
      return;
    }

    const message = decodeFrame(frame);
    if (message === null) {
      fail(new Error(`Invalid protocol frame: ${frame}`));
      return;
    }

    deliver(message);
  }

  function deliver(message: ProtocolMessage): void {
    const waiter = waiters.shift();
    if (waiter === undefined) {
      buffered.push(message);
      return;
    }

    waiter.resolve(message);
  }

  function fail(error: Error): void {
    const channelFailure = failure ?? error;
    failure = channelFailure;

    for (
      let waiter = waiters.shift();
      waiter !== undefined;
      waiter = waiters.shift()
    ) {
      waiter.reject(channelFailure);
    }
  }

  return {
    async close() {
      fail(new Error("Channel closed."));

      if (!child.killed) {
        child.kill();
      }
    },
    async receive() {
      const bufferedMessage = buffered.shift();
      if (bufferedMessage !== undefined) {
        return bufferedMessage;
      }

      if (failure !== null) {
        throw failure;
      }

      return new Promise<ProtocolMessage>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    async send(message) {
      if (failure !== null) {
        throw failure;
      }

      await writeFrame(child.stdin, encodeJsonRpcMessage(message));
    },
  };
}

function decodeFrame(frame: string): ProtocolMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(frame);
  } catch {
    return null;
  }

  return decodeJsonRpcMessage(parsed);
}

function writeFrame(stream: Writable, frame: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(`${JSON.stringify(frame)}\n`, (error) => {
      if (error === null || error === undefined) {
        resolve();
        return;
      }

      reject(error);
    });
  });
}
