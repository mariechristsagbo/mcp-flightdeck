import type {
  JsonRpcError,
  JsonValue,
  ProtocolEvent,
  ProtocolMessage,
  ProtocolTransport,
  Redaction,
} from "../../protocol/src/protocol-event.js";
import {
  createTraceDocument,
  type TraceDocument,
  type TraceStatus,
} from "./trace-document.js";

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

function parseProtocolEvent(value: unknown): ProtocolEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const { atMs, direction, message, redactions, sequence, transport } = value;
  const parsedTransport = parseProtocolTransport(transport);
  const parsedMessage = parseProtocolMessage(message);
  const parsedRedactions = parseRedactions(redactions);

  if (
    !isPositiveSafeInteger(sequence) ||
    !isNonNegativeFiniteNumber(atMs) ||
    !isDirection(direction) ||
    parsedTransport === null ||
    parsedMessage === null ||
    parsedRedactions === null
  ) {
    return null;
  }

  return {
    sequence,
    atMs,
    direction,
    transport: parsedTransport,
    message: parsedMessage,
    redactions: parsedRedactions,
  };
}

function parseProtocolTransport(value: unknown): ProtocolTransport | null {
  if (!isRecord(value)) {
    return null;
  }

  const { kind } = value;

  if (kind === "stdio") {
    return { kind: "stdio" };
  }

  if (kind === "streamable-http") {
    const requestId = value.requestId;
    if (requestId !== undefined && typeof requestId !== "string") {
      return null;
    }

    return requestId === undefined
      ? { kind: "streamable-http" }
      : { kind: "streamable-http", requestId };
  }

  if (kind === "sse") {
    const eventId = value.eventId;
    if (eventId !== undefined && typeof eventId !== "string") {
      return null;
    }

    return eventId === undefined ? { kind: "sse" } : { kind: "sse", eventId };
  }

  return null;
}

function parseProtocolMessage(value: unknown): ProtocolMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const { error, id, kind, method, result } = value;

  if (kind === "request") {
    return isJsonRpcId(id) && typeof method === "string"
      ? parseParams(value, (params) =>
          params === undefined
            ? { kind: "request", id, method }
            : { kind: "request", id, method, params },
        )
      : null;
  }

  if (kind === "response") {
    return isJsonRpcId(id) && isJsonValue(result)
      ? { kind: "response", id, result }
      : null;
  }

  if (kind === "error") {
    const parsedError = parseJsonRpcError(error);
    return isJsonRpcErrorId(id) && parsedError !== null
      ? { kind: "error", id, error: parsedError }
      : null;
  }

  if (kind === "notification") {
    return typeof method === "string"
      ? parseParams(value, (params) =>
          params === undefined
            ? { kind: "notification", method }
            : { kind: "notification", method, params },
        )
      : null;
  }

  return null;
}

function parseParams<T>(
  value: Record<string, unknown>,
  createMessage: (params: JsonValue | undefined) => T,
): T | null {
  if (!Object.hasOwn(value, "params")) {
    return createMessage(undefined);
  }

  const { params } = value;
  return isJsonValue(params) ? createMessage(params) : null;
}

function parseJsonRpcError(value: unknown): JsonRpcError | null {
  if (!isRecord(value)) {
    return null;
  }

  const { code, data, message } = value;
  if (typeof code !== "number" || !Number.isFinite(code)) {
    return null;
  }

  if (typeof message !== "string") {
    return null;
  }

  if (!Object.hasOwn(value, "data")) {
    return { code, message };
  }

  return isJsonValue(data) ? { code, message, data } : null;
}

function parseRedactions(value: unknown): readonly Redaction[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const redactions: Redaction[] = [];

  for (const redaction of value) {
    if (!isRecord(redaction)) {
      return null;
    }

    const { path, reason } = redaction;
    if (typeof path !== "string" || !isRedactionReason(reason)) {
      return null;
    }

    redactions.push({ path, reason });
  }

  return redactions;
}

function isDirection(value: unknown): value is "inbound" | "outbound" {
  return value === "inbound" || value === "outbound";
}

function isJsonRpcErrorId(value: unknown): value is number | string | null {
  return value === null || isJsonRpcId(value);
}

function isJsonRpcId(value: unknown): value is number | string {
  return typeof value === "string" || Number.isFinite(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    Number.isFinite(value)
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRedactionReason(
  value: unknown,
): value is "secret" | "sensitive" | "user-defined" {
  return (
    value === "secret" || value === "sensitive" || value === "user-defined"
  );
}

function isTraceStatus(value: unknown): value is TraceStatus {
  return value === "completed" || value === "interrupted";
}
