import type { JsonValue } from "../../protocol/src/json-value.js";
import type {
  ProtocolEvent,
  ProtocolMessage,
  Redaction,
} from "../../protocol/src/protocol-event.js";
import type { TraceDocument } from "./trace-document.js";

/** Placeholder written in place of a redacted value. */
export const REDACTED = "[REDACTED]";

const SENSITIVE_KEY =
  /^(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|x-api-key|private[_-]?key)$/i;

const BEARER_VALUE = /^Bearer\s+\S+$/i;

const BASIC_VALUE = /^Basic\s+\S+$/i;

const TOKEN_VALUE = /^(sk-|ghp_|github_pat_|xox[a-z]-)/;

/**
 * Remove credentials from a trace document before it is stored or shared.
 *
 * Two rules apply, and both are deliberately narrow so a reviewer can predict
 * the result: a key whose name is a known credential field is replaced, and a
 * value that looks like a credential is replaced even under an unrelated key.
 * Every replacement is recorded on the event as a redaction entry carrying the
 * payload path, so a reader can tell that something was removed without seeing
 * what it was.
 *
 * Redaction is lossy by design and idempotent: a value that is already redacted
 * is left alone, so writing the same artifact twice does not accumulate
 * entries. A redacted trace is evidence of what happened, not a replayable
 * copy — replaying a session that carried credentials requires supplying them
 * separately.
 */
export function redactTraceDocument(trace: TraceDocument): TraceDocument {
  const events = trace.events.map((event, index) => redactEvent(event, index));

  return events.every((event, index) => event === trace.events[index])
    ? trace
    : { ...trace, events };
}

function redactEvent(event: ProtocolEvent, index: number): ProtocolEvent {
  const redactions: Redaction[] = [];
  const message = redactMessage(
    event.message,
    `$.events[${String(index)}].message`,
    redactions,
  );

  if (redactions.length === 0) {
    return event;
  }

  return {
    ...event,
    message,
    redactions: [...event.redactions, ...redactions],
  };
}

function redactMessage(
  message: ProtocolMessage,
  path: string,
  redactions: Redaction[],
): ProtocolMessage {
  if (message.kind === "request" || message.kind === "notification") {
    return message.params === undefined
      ? message
      : {
          ...message,
          params: redactValue(message.params, `${path}.params`, redactions),
        };
  }

  if (message.kind === "response") {
    return {
      ...message,
      result: redactValue(message.result, `${path}.result`, redactions),
    };
  }

  return message.error.data === undefined
    ? message
    : {
        ...message,
        error: {
          ...message.error,
          data: redactValue(
            message.error.data,
            `${path}.error.data`,
            redactions,
          ),
        },
      };
}

function redactValue(
  value: JsonValue,
  path: string,
  redactions: Redaction[],
): JsonValue {
  if (typeof value === "string") {
    return redactString(value, path, redactions);
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      redactValue(entry, `${path}[${String(index)}]`, redactions),
    );
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  const redacted: Record<string, JsonValue> = {};
  const entries: [string, JsonValue][] = Object.entries(value);

  for (const [key, entry] of entries) {
    const entryPath = `${path}.${key}`;

    if (SENSITIVE_KEY.test(key)) {
      redacted[key] = redactSensitiveValue(entry, entryPath, redactions);
      continue;
    }

    redacted[key] = redactValue(entry, entryPath, redactions);
  }

  return redacted;
}

function redactSensitiveValue(
  value: JsonValue,
  path: string,
  redactions: Redaction[],
): JsonValue {
  if (isRedacted(value)) {
    return value;
  }

  redactions.push({ path, reason: "sensitive" });
  return REDACTED;
}

function redactString(
  value: string,
  path: string,
  redactions: Redaction[],
): JsonValue {
  if (isRedacted(value)) {
    return value;
  }

  if (BEARER_VALUE.test(value)) {
    redactions.push({ path, reason: "secret" });
    return `Bearer ${REDACTED}`;
  }

  if (BASIC_VALUE.test(value)) {
    redactions.push({ path, reason: "secret" });
    return `Basic ${REDACTED}`;
  }

  if (TOKEN_VALUE.test(value)) {
    redactions.push({ path, reason: "secret" });
    return REDACTED;
  }

  return value;
}

function isRedacted(value: JsonValue): boolean {
  return typeof value === "string" && value.includes(REDACTED);
}
