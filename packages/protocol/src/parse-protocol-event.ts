import {
  isJsonValue,
  isNonNegativeFiniteNumber,
  isPositiveSafeInteger,
  isRecord,
  type JsonValue,
} from "./json-value.js";
import type {
  JsonRpcError,
  JsonRpcId,
  ProtocolEvent,
  ProtocolMessage,
  ProtocolTransport,
  Redaction,
} from "./protocol-event.js";

/**
 * Validators for a single normalized protocol payload.
 *
 * Everything a transport, a trace file, or a workflow hands to the rest of the
 * system passes through here first: MCP data arriving from a server is
 * untrusted input, and a value that does not validate is rejected instead of
 * being cast into a protocol type.
 */
export function parseProtocolEvent(value: unknown): ProtocolEvent | null {
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

export function parseProtocolMessage(value: unknown): ProtocolMessage | null {
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

export function parseProtocolTransport(
  value: unknown,
): ProtocolTransport | null {
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

export function parseRedactions(value: unknown): readonly Redaction[] | null {
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

function isDirection(value: unknown): value is "inbound" | "outbound" {
  return value === "inbound" || value === "outbound";
}

function isJsonRpcErrorId(value: unknown): value is JsonRpcId | null {
  return value === null || isJsonRpcId(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || Number.isFinite(value);
}

function isRedactionReason(
  value: unknown,
): value is "secret" | "sensitive" | "user-defined" {
  return (
    value === "secret" || value === "sensitive" || value === "user-defined"
  );
}
