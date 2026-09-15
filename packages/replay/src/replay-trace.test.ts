import { describe, expect, it } from "vitest";

import type { MessageChannel } from "../../protocol/src/message-channel.js";
import type {
  JsonRpcId,
  ProtocolEvent,
  ProtocolMessage,
} from "../../protocol/src/protocol-event.js";
import { createTraceDocument } from "../../recorder/src/trace-document.js";
import { replayTrace } from "./replay-trace.js";

const INITIALIZE_REQUEST: ProtocolMessage = {
  kind: "request",
  id: "initialize-1",
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
  },
};

const INITIALIZE_RESPONSE: ProtocolMessage = {
  kind: "response",
  id: "initialize-1",
  result: {
    serverInfo: {
      name: "payments-mcp",
      version: "1.0.0",
    },
  },
};

const PROGRESS_NOTIFICATION: ProtocolMessage = {
  kind: "notification",
  method: "notifications/progress",
  params: {
    progress: 50,
  },
};

const SHUTDOWN_NOTIFICATION: ProtocolMessage = {
  kind: "notification",
  method: "notifications/cancelled",
  params: {
    requestId: "initialize-1",
  },
};

function createSourceTrace(events: readonly ProtocolEvent[]) {
  return createTraceDocument({
    id: "run_01",
    startedAt: "2026-09-15T08:00:00.000Z",
    status: "completed",
    events,
  });
}

function createEvent(
  sequence: number,
  atMs: number,
  direction: ProtocolEvent["direction"],
  message: ProtocolMessage,
): ProtocolEvent {
  return {
    sequence,
    atMs,
    direction,
    transport: {
      kind: "stdio",
    },
    message,
    redactions: [],
  };
}

function createSteppingClock(): () => number {
  let elapsedMs = 0;

  return () => {
    elapsedMs += 5;
    return elapsedMs;
  };
}

function createFakeChannel(replies: readonly ProtocolMessage[]): {
  channel: MessageChannel;
  sent: ProtocolMessage[];
} {
  const pending = [...replies];
  const sent: ProtocolMessage[] = [];

  return {
    sent,
    channel: {
      async send(message) {
        sent.push(message);
      },
      async receive() {
        const reply = pending.shift();
        if (reply === undefined) {
          throw new Error("Channel closed.");
        }

        return reply;
      },
    },
  };
}

async function replay(
  source: ReturnType<typeof createSourceTrace>,
  channel: MessageChannel,
) {
  return replayTrace({
    channel,
    clock: createSteppingClock(),
    id: "run_02",
    source,
    startedAt: "2026-09-15T09:00:00.000Z",
    transport: {
      kind: "stdio",
    },
  });
}

describe("replayTrace", () => {
  it("replays an outbound request and records the matching response", async () => {
    const source = createSourceTrace([
      createEvent(1, 0, "outbound", INITIALIZE_REQUEST),
      createEvent(2, 43, "inbound", INITIALIZE_RESPONSE),
    ]);
    const { channel, sent } = createFakeChannel([INITIALIZE_RESPONSE]);

    const outcome = await replay(source, channel);

    expect(sent).toEqual([INITIALIZE_REQUEST]);
    expect(outcome.failure).toBeNull();
    expect(outcome.trace).toEqual({
      formatVersion: 1,
      id: "run_02",
      startedAt: "2026-09-15T09:00:00.000Z",
      status: "completed",
      durationMs: 10,
      events: [
        createEvent(1, 5, "outbound", INITIALIZE_REQUEST),
        createEvent(2, 10, "inbound", INITIALIZE_RESPONSE),
      ],
    });
  });

  it("records inbound messages that arrive before the matching response", async () => {
    const source = createSourceTrace([
      createEvent(1, 0, "outbound", INITIALIZE_REQUEST),
    ]);
    const { channel } = createFakeChannel([
      PROGRESS_NOTIFICATION,
      unrelatedResponse("tools-1"),
      INITIALIZE_RESPONSE,
    ]);

    const outcome = await replay(source, channel);

    expect(outcome.trace.events.map((event) => event.message)).toEqual([
      INITIALIZE_REQUEST,
      PROGRESS_NOTIFICATION,
      unrelatedResponse("tools-1"),
      INITIALIZE_RESPONSE,
    ]);
    expect(outcome.trace.events.map((event) => event.direction)).toEqual([
      "outbound",
      "inbound",
      "inbound",
      "inbound",
    ]);
    expect(outcome.failure).toBeNull();
  });

  it("sends notifications without waiting for a response", async () => {
    const source = createSourceTrace([
      createEvent(1, 0, "outbound", SHUTDOWN_NOTIFICATION),
    ]);
    const { channel, sent } = createFakeChannel([]);

    const outcome = await replay(source, channel);

    expect(sent).toEqual([SHUTDOWN_NOTIFICATION]);
    expect(outcome.failure).toBeNull();
    expect(outcome.trace.status).toBe("completed");
    expect(outcome.trace.events).toEqual([
      createEvent(1, 5, "outbound", SHUTDOWN_NOTIFICATION),
    ]);
  });

  it("keeps the events recorded before a failing send", async () => {
    const source = createSourceTrace([
      createEvent(1, 0, "outbound", PROGRESS_NOTIFICATION),
      createEvent(2, 12, "outbound", INITIALIZE_REQUEST),
    ]);
    const { channel, sent } = createFakeChannel([]);
    const failingChannel: MessageChannel = {
      async send(message) {
        if (message === INITIALIZE_REQUEST) {
          throw new Error("Server terminated the connection.");
        }

        await channel.send(message);
      },
      receive: channel.receive,
    };

    const outcome = await replay(source, failingChannel);

    expect(sent).toEqual([PROGRESS_NOTIFICATION]);
    expect(outcome.failure).toEqual({
      message: "Server terminated the connection.",
      phase: "send",
    });
    expect(outcome.trace.status).toBe("interrupted");
    expect(outcome.trace.events).toEqual([
      createEvent(1, 5, "outbound", PROGRESS_NOTIFICATION),
      createEvent(2, 10, "outbound", INITIALIZE_REQUEST),
    ]);
  });

  it("interrupts the replay when the response never arrives", async () => {
    const source = createSourceTrace([
      createEvent(1, 0, "outbound", INITIALIZE_REQUEST),
    ]);
    const { channel } = createFakeChannel([]);

    const outcome = await replay(source, channel);

    expect(outcome.failure).toEqual({
      message: "Channel closed.",
      phase: "receive",
    });
    expect(outcome.trace.status).toBe("interrupted");
    expect(outcome.trace.events).toEqual([
      createEvent(1, 5, "outbound", INITIALIZE_REQUEST),
    ]);
  });
});

function unrelatedResponse(id: JsonRpcId): ProtocolMessage {
  return {
    kind: "response",
    id,
    result: {},
  };
}
