import type { ProtocolMessage } from "./protocol-event.js";

/**
 * Boundary between a replay and a concrete MCP transport.
 *
 * `protocol` owns this port so transports can implement it without depending
 * on the layers that consume it. Lifecycle management stays with the caller:
 * opening and closing a real connection is not part of a replayed exchange.
 */
export type MessageChannel = Readonly<{
  receive: () => Promise<ProtocolMessage>;
  send: (message: ProtocolMessage) => Promise<void>;
}>;

/**
 * A channel whose underlying process or connection is owned by the caller.
 *
 * `close` is composed here rather than folded into `MessageChannel` so a
 * consumer that only exchanges messages — like a replay — cannot end up
 * managing a resource it does not own.
 */
export type ManagedMessageChannel = MessageChannel &
  Readonly<{
    close: () => Promise<void>;
  }>;
