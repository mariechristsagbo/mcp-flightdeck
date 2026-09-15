import type { MessageChannel } from "../../protocol/src/message-channel.js";
import {
  createProtocolEvent,
  type JsonRpcErrorResponse,
  type JsonRpcId,
  type JsonRpcResponse,
  type ProtocolEvent,
  type ProtocolMessage,
  type ProtocolTransport,
} from "../../protocol/src/protocol-event.js";
import {
  createTraceDocument,
  type TraceDocument,
} from "../../recorder/src/trace-document.js";

export type ReplayFailure = Readonly<{
  message: string;
  phase: ReplayPhase;
}>;

export type ReplayPhase = "receive" | "respond" | "send";

export type ReplayOutcome = Readonly<{
  failure: ReplayFailure | null;
  trace: TraceDocument;
}>;

export type ReplayTraceOptions = Readonly<{
  channel: MessageChannel;
  clock: () => number;
  id: string;
  source: TraceDocument;
  startedAt: string;
  transport: ProtocolTransport;
}>;

type EventRecorder = Readonly<{
  events: () => readonly ProtocolEvent[];
  recordInbound: (message: ProtocolMessage) => void;
  recordOutbound: (message: ProtocolMessage) => void;
}>;

type ReplyMessage = JsonRpcErrorResponse | JsonRpcResponse;

type ExchangeOutcome =
  | Readonly<{ failure: ReplayFailure; kind: "failed" }>
  | Readonly<{ kind: "settled" }>;

/**
 * Replay the client-initiated messages of a recorded session and capture the
 * result as a new trace.
 *
 * The source trace is evidence of what happened; the produced trace is evidence
 * of what happens now. Server-initiated requests are answered from the replies
 * the source trace already recorded, so a replay never blocks waiting for a
 * decision a recorded session had already made. Nothing observed here is
 * persisted and no redaction is applied: both belong to the layers that own
 * storage.
 */
export async function replayTrace(
  options: ReplayTraceOptions,
): Promise<ReplayOutcome> {
  const { channel, clock, id, source, startedAt, transport } = options;
  const recorder = createEventRecorder(clock, transport);
  const recordedReplies = collectRecordedReplies(source);
  let failure: ReplayFailure | null = null;

  for (const sourceEvent of source.events) {
    if (sourceEvent.direction !== "outbound") {
      continue;
    }

    const { message } = sourceEvent;
    if (isReply(message)) {
      // Replies are sent in response to a server-initiated request, not on
      // their own schedule.
      continue;
    }

    recorder.recordOutbound(message);
    try {
      await channel.send(message);
    } catch (error: unknown) {
      failure = { message: describeFailure(error), phase: "send" };
      break;
    }

    if (message.kind !== "request") {
      continue;
    }

    const outcome = await completeExchange(
      channel,
      message.id,
      recordedReplies,
      recorder,
    );

    if (outcome.kind === "failed") {
      failure = outcome.failure;
      break;
    }
  }

  return {
    failure,
    trace: createTraceDocument({
      id,
      startedAt,
      status: failure === null ? "completed" : "interrupted",
      events: recorder.events(),
    }),
  };
}

async function completeExchange(
  channel: MessageChannel,
  requestId: JsonRpcId,
  recordedReplies: ReadonlyMap<JsonRpcId, ReplyMessage>,
  recorder: EventRecorder,
): Promise<ExchangeOutcome> {
  for (;;) {
    let received: ProtocolMessage;
    try {
      received = await channel.receive();
    } catch (error: unknown) {
      return fail("receive", describeFailure(error));
    }

    recorder.recordInbound(received);

    if (received.kind === "request") {
      const reply = recordedReplies.get(received.id);
      if (reply === undefined) {
        return fail(
          "respond",
          `Missing recorded reply for peer request ${String(received.id)}`,
        );
      }

      recorder.recordOutbound(reply);
      try {
        await channel.send(reply);
      } catch (error: unknown) {
        return fail("send", describeFailure(error));
      }

      continue;
    }

    if (isResponseTo(received, requestId)) {
      return { kind: "settled" };
    }
  }
}

function fail(phase: ReplayPhase, message: string): ExchangeOutcome {
  return { kind: "failed", failure: { message, phase } };
}

function createEventRecorder(
  clock: () => number,
  transport: ProtocolTransport,
): EventRecorder {
  const events: ProtocolEvent[] = [];

  function record(
    direction: ProtocolEvent["direction"],
    message: ProtocolMessage,
  ): void {
    events.push(
      createProtocolEvent({
        sequence: events.length + 1,
        atMs: clock(),
        direction,
        transport,
        message,
        redactions: [],
      }),
    );
  }

  return {
    events: () => events,
    recordInbound: (message) => {
      record("inbound", message);
    },
    recordOutbound: (message) => {
      record("outbound", message);
    },
  };
}

function collectRecordedReplies(
  source: TraceDocument,
): ReadonlyMap<JsonRpcId, ReplyMessage> {
  const replies = new Map<JsonRpcId, ReplyMessage>();

  for (const event of source.events) {
    const { message } = event;
    if (
      event.direction === "outbound" &&
      isReply(message) &&
      message.id !== null
    ) {
      replies.set(message.id, message);
    }
  }

  return replies;
}

function isReply(message: ProtocolMessage): message is ReplyMessage {
  return message.kind === "response" || message.kind === "error";
}

function isResponseTo(message: ProtocolMessage, requestId: JsonRpcId): boolean {
  return (
    (message.kind === "response" || message.kind === "error") &&
    message.id === requestId
  );
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown channel failure";
}
