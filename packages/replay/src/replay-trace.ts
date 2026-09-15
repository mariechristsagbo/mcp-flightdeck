import type { MessageChannel } from "../../protocol/src/message-channel.js";
import {
  createProtocolEvent,
  type JsonRpcId,
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
  phase: "receive" | "send";
}>;

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

/**
 * Replay the outbound messages of a recorded session and capture the result as
 * a new trace.
 *
 * The source trace is evidence of what happened; the produced trace is evidence
 * of what happens now. Nothing observed during a replay is persisted here, and
 * no redaction is applied: both belong to the layers that own storage.
 */
export async function replayTrace(
  options: ReplayTraceOptions,
): Promise<ReplayOutcome> {
  const { channel, clock, id, source, startedAt, transport } = options;
  const events: ProtocolEvent[] = [];
  let failure: ReplayFailure | null = null;

  for (const sourceEvent of source.events) {
    if (sourceEvent.direction !== "outbound") {
      continue;
    }

    const { message } = sourceEvent;
    events.push(record("outbound", clock(), message, transport, events.length));

    try {
      await channel.send(message);
    } catch (error: unknown) {
      failure = { message: describeFailure(error), phase: "send" };
      break;
    }

    if (message.kind !== "request") {
      continue;
    }

    try {
      await collectUntilResponse(channel, message.id, (received) => {
        events.push(
          record("inbound", clock(), received, transport, events.length),
        );
      });
    } catch (error: unknown) {
      failure = { message: describeFailure(error), phase: "receive" };
      break;
    }
  }

  return {
    failure,
    trace: createTraceDocument({
      id,
      startedAt,
      status: failure === null ? "completed" : "interrupted",
      events,
    }),
  };
}

async function collectUntilResponse(
  channel: MessageChannel,
  requestId: JsonRpcId,
  recordReceived: (message: ProtocolMessage) => void,
): Promise<void> {
  for (;;) {
    const received = await channel.receive();
    recordReceived(received);

    if (isResponseTo(received, requestId)) {
      return;
    }
  }
}

function record(
  direction: ProtocolEvent["direction"],
  atMs: number,
  message: ProtocolMessage,
  transport: ProtocolTransport,
  recordedEvents: number,
): ProtocolEvent {
  return createProtocolEvent({
    sequence: recordedEvents + 1,
    atMs,
    direction,
    transport,
    message,
    redactions: [],
  });
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
