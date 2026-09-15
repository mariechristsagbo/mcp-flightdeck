import {
  isNonNegativeFiniteNumber,
  isRecord,
} from "../../protocol/src/json-value.js";
import { parseProtocolEvent } from "../../protocol/src/parse-protocol-event.js";
import type { ProtocolEvent } from "../../protocol/src/protocol-event.js";
import {
  createTraceDocument,
  type TraceDocument,
  type TraceStatus,
} from "./trace-document.js";

/**
 * Validator for a persisted trace artifact.
 *
 * Trace-level concerns live here — identity, status, derived duration, and the
 * contiguous ordering of events. The payload of each event is validated by
 * `protocol`, so a trace file and a transport frame are held to the same rules.
 */
export function parseTraceDocument(value: unknown): TraceDocument | null {
  if (!isRecord(value) || !Array.isArray(value.events)) {
    return null;
  }

  const { events, formatVersion, id, startedAt, status, durationMs } = value;
  const parsedEvents = parseProtocolEvents(events);

  if (
    formatVersion !== 1 ||
    typeof id !== "string" ||
    typeof startedAt !== "string" ||
    !isTraceStatus(status) ||
    !isNonNegativeFiniteNumber(durationMs) ||
    parsedEvents === null
  ) {
    return null;
  }

  let trace: TraceDocument;
  try {
    trace = createTraceDocument({
      id,
      startedAt,
      status,
      events: parsedEvents,
    });
  } catch {
    return null;
  }

  return trace.durationMs === durationMs ? trace : null;
}

function parseProtocolEvents(
  values: readonly unknown[],
): readonly ProtocolEvent[] | null {
  const events: ProtocolEvent[] = [];

  for (const value of values) {
    const event = parseProtocolEvent(value);
    if (event === null) {
      return null;
    }

    events.push(event);
  }

  return events;
}

function isTraceStatus(value: unknown): value is TraceStatus {
  return value === "completed" || value === "interrupted";
}
