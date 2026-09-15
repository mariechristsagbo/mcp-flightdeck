import { isRecord, type JsonObject, type JsonValue } from "./json-value.js";
import { parseProtocolMessage } from "./parse-protocol-event.js";
import type { JsonRpcError, ProtocolMessage } from "./protocol-event.js";

export const JSON_RPC_VERSION = "2.0";

/**
 * Translation between the JSON-RPC wire format and the normalized message model.
 *
 * The model carries a `kind` discriminator so the rest of the system can branch
 * on a message type instead of inspecting which fields happen to be present.
 * Only transports speak the wire format, and they speak it through these two
 * functions, so an unknown frame can never reach a trace as a protocol message.
 */
export function decodeJsonRpcMessage(value: unknown): ProtocolMessage | null {
  if (!isRecord(value) || value.jsonrpc !== JSON_RPC_VERSION) {
    return null;
  }

  const { error, id, method, params, result } = value;

  if (typeof method === "string") {
    return parseProtocolMessage(
      id === undefined
        ? {
            kind: "notification",
            method,
            ...(params === undefined ? {} : { params }),
          }
        : {
            kind: "request",
            id,
            method,
            ...(params === undefined ? {} : { params }),
          },
    );
  }

  if (Object.hasOwn(value, "error")) {
    return parseProtocolMessage({ kind: "error", id: id ?? null, error });
  }

  if (Object.hasOwn(value, "result")) {
    return parseProtocolMessage({ kind: "response", id, result });
  }

  return null;
}

export function encodeJsonRpcMessage(message: ProtocolMessage): JsonObject {
  const base = { jsonrpc: JSON_RPC_VERSION };

  if (message.kind === "request") {
    return withParams(
      { ...base, id: message.id, method: message.method },
      message.params,
    );
  }

  if (message.kind === "notification") {
    return withParams({ ...base, method: message.method }, message.params);
  }

  if (message.kind === "response") {
    return { ...base, id: message.id, result: message.result };
  }

  return { ...base, id: message.id, error: encodeError(message.error) };
}

function encodeError(error: JsonRpcError): JsonObject {
  return error.data === undefined
    ? { code: error.code, message: error.message }
    : { code: error.code, message: error.message, data: error.data };
}

function withParams(
  base: JsonObject,
  params: JsonValue | undefined,
): JsonObject {
  return params === undefined ? base : { ...base, params };
}
