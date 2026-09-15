import {
  isRecord,
  type JsonArray,
  type JsonObject,
} from "../../protocol/src/json-value.js";
import type { ManagedMessageChannel } from "../../protocol/src/message-channel.js";
import type { ProtocolMessage } from "../../protocol/src/protocol-event.js";

type InspectionRequest = Extract<
  ProtocolMessage,
  Readonly<{ kind: "request" }>
> &
  Readonly<{ id: string }>;
import {
  spawnStdioChannel,
  type StdioChannelOptions,
} from "../../transports/src/stdio-channel.js";

export type InspectionReport = Readonly<{
  capabilities: JsonObject;
  prompts?: JsonArray;
  protocolVersion: string;
  resources?: JsonArray;
  serverInfo: JsonObject;
  tools?: JsonArray;
}>;

export type InspectorClientInfo = Readonly<{
  name: string;
  version: string;
}>;

export type InspectChannelOptions = Readonly<{
  clientInfo: InspectorClientInfo;
  requestTimeoutMs: number;
}>;

export type InspectStdioServerOptions = StdioChannelOptions &
  InspectChannelOptions;

/**
 * Negotiate and discover the surface of an MCP server over an owned channel.
 *
 * The inspector only asks for lists the server advertised at initialize time.
 * It intentionally keeps list entries as validated JSON instead of imposing a
 * lossy tool/resource/prompt model before contract intelligence owns that
 * schema. Notifications are ignored during discovery; a server-initiated
 * request fails the inspection explicitly because there is no safe answer to
 * invent in an inspect-only command.
 */
export async function inspectChannel(
  channel: ManagedMessageChannel,
  options: InspectChannelOptions,
): Promise<InspectionReport> {
  let nextRequest = 1;

  try {
    const initialize = await request(channel, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: options.clientInfo,
    });
    const initialized = parseInitializeResult(initialize);

    await channel.send({
      kind: "notification",
      method: "notifications/initialized",
    });

    const tools = await listCapability(
      channel,
      initialized.capabilities,
      "tools",
      "tools/list",
      "tools",
      options.requestTimeoutMs,
      () => `tools-list-${String(nextRequest++)}`,
    );
    const resources = await listCapability(
      channel,
      initialized.capabilities,
      "resources",
      "resources/list",
      "resources",
      options.requestTimeoutMs,
      () => `resources-list-${String(nextRequest++)}`,
    );
    const prompts = await listCapability(
      channel,
      initialized.capabilities,
      "prompts",
      "prompts/list",
      "prompts",
      options.requestTimeoutMs,
      () => `prompts-list-${String(nextRequest++)}`,
    );

    return {
      protocolVersion: initialized.protocolVersion,
      capabilities: initialized.capabilities,
      serverInfo: initialized.serverInfo,
      ...(tools === undefined ? {} : { tools }),
      ...(resources === undefined ? {} : { resources }),
      ...(prompts === undefined ? {} : { prompts }),
    };
  } finally {
    await channel.close();
  }

  function request(
    requestChannel: ManagedMessageChannel,
    method: string,
    params: JsonObject,
  ): Promise<ProtocolMessage> {
    const id = `${method.replace("/", "-")}-${String(nextRequest)}`;
    nextRequest += 1;

    return exchange(
      requestChannel,
      { kind: "request", id, method, params },
      options.requestTimeoutMs,
    );
  }
}

export async function inspectStdioServer(
  options: InspectStdioServerOptions,
): Promise<InspectionReport> {
  const { clientInfo, requestTimeoutMs, ...channelOptions } = options;
  const channel = spawnStdioChannel(channelOptions);

  return inspectChannel(channel, { clientInfo, requestTimeoutMs });
}

async function listCapability(
  channel: ManagedMessageChannel,
  capabilities: JsonObject,
  capability: string,
  method: string,
  property: string,
  requestTimeoutMs: number,
  nextId: () => string,
): Promise<JsonArray | undefined> {
  if (!Object.hasOwn(capabilities, capability)) {
    return undefined;
  }

  const response = await exchange(
    channel,
    { kind: "request", id: nextId(), method },
    requestTimeoutMs,
  );

  if (response.kind === "error") {
    throw new Error(`MCP ${method} failed: ${response.error.message}`);
  }

  if (response.kind !== "response" || !isRecord(response.result)) {
    throw new Error(`MCP ${method} returned an invalid response.`);
  }

  const entries = response.result[property];
  if (!Array.isArray(entries)) {
    throw new Error(`MCP ${method} returned no ${property} array.`);
  }

  return entries;
}

async function exchange(
  channel: ManagedMessageChannel,
  request: InspectionRequest,
  requestTimeoutMs: number,
): Promise<ProtocolMessage> {
  await channel.send(request);

  for (;;) {
    const received = await withTimeout(
      channel.receive(),
      request.method,
      requestTimeoutMs,
    );

    if (received.kind === "request") {
      throw new Error(
        `MCP server initiated unsupported request during inspection: ${received.method}.`,
      );
    }

    if (
      (received.kind === "response" || received.kind === "error") &&
      received.id === request.id
    ) {
      return received;
    }
  }
}

function parseInitializeResult(response: ProtocolMessage): Readonly<{
  capabilities: JsonObject;
  protocolVersion: string;
  serverInfo: JsonObject;
}> {
  if (response.kind === "error") {
    throw new Error(`MCP initialize failed: ${response.error.message}`);
  }

  if (response.kind !== "response" || !isRecord(response.result)) {
    throw new Error("MCP initialize returned an invalid response.");
  }

  const { capabilities, protocolVersion, serverInfo } = response.result;
  if (
    !isRecord(capabilities) ||
    typeof protocolVersion !== "string" ||
    !isRecord(serverInfo)
  ) {
    throw new Error("MCP initialize response is missing required fields.");
  }

  return { capabilities, protocolVersion, serverInfo };
}

function withTimeout<T>(
  promise: Promise<T>,
  operation: string,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${operation}.`)),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  });
}
