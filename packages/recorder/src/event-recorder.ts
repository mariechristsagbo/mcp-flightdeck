import type {
  ProtocolEvent,
  ProtocolMessage,
  ProtocolTransport,
} from "../../protocol/src/protocol-event.js";

export type EventRecorder = Readonly<{
  events: readonly ProtocolEvent[];
  record: (
    direction: ProtocolEvent["direction"],
    message: ProtocolMessage,
  ) => void;
}>;

export type CreateEventRecorderOptions = Readonly<{
  clock?: () => number;
  transport: ProtocolTransport;
}>;

/** Collect ordered protocol evidence from a live transport exchange. */
export function createEventRecorder(
  options: CreateEventRecorderOptions,
): EventRecorder {
  const clock = options.clock ?? performance.now.bind(performance);
  const startedAtMs = clock();
  const events: ProtocolEvent[] = [];

  return {
    events,
    record(direction, message) {
      events.push({
        sequence: events.length + 1,
        atMs: Math.round(clock() - startedAtMs),
        direction,
        transport: options.transport,
        message,
        redactions: [],
      });
    },
  };
}
