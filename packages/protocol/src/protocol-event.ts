import type { JsonValue } from "./json-value.js";

export type {
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from "./json-value.js";

export type JsonRpcId = number | string;

export type JsonRpcRequest = Readonly<{
  id: JsonRpcId;
  kind: "request";
  method: string;
  params?: JsonValue;
}>;

export type JsonRpcResponse = Readonly<{
  id: JsonRpcId;
  kind: "response";
  result: JsonValue;
}>;

export type JsonRpcError = Readonly<{
  code: number;
  data?: JsonValue;
  message: string;
}>;

export type JsonRpcErrorResponse = Readonly<{
  error: JsonRpcError;
  id: JsonRpcId | null;
  kind: "error";
}>;

export type JsonRpcNotification = Readonly<{
  kind: "notification";
  method: string;
  params?: JsonValue;
}>;

export type ProtocolMessage =
  JsonRpcErrorResponse | JsonRpcNotification | JsonRpcRequest | JsonRpcResponse;

export type ProtocolTransport =
  | Readonly<{
      kind: "stdio";
    }>
  | Readonly<{
      kind: "streamable-http";
      requestId?: string;
    }>
  | Readonly<{
      eventId?: string;
      kind: "sse";
    }>;

export type RedactionReason = "secret" | "sensitive" | "user-defined";

export type Redaction = Readonly<{
  path: string;
  reason: RedactionReason;
}>;

export type ProtocolEvent = Readonly<{
  atMs: number;
  direction: "inbound" | "outbound";
  message: ProtocolMessage;
  redactions: readonly Redaction[];
  sequence: number;
  transport: ProtocolTransport;
}>;

export function createProtocolEvent(event: ProtocolEvent): ProtocolEvent {
  return event;
}
