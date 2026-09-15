import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { inspectStdioServer } from "../../../packages/inspect/src/inspect-server.js";
import { createEventRecorder } from "../../../packages/recorder/src/event-recorder.js";
import { writeTraceDocument } from "../../../packages/recorder/src/trace-file-store.js";
import { createTraceDocument } from "../../../packages/recorder/src/trace-document.js";

const CLIENT_INFO = {
  name: "mcp-flightdeck",
  version: "0.0.0",
};
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export async function run(argv: readonly string[]): Promise<string> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      arg: { type: "string", multiple: true },
      command: { type: "string" },
      output: { type: "string" },
      timeout: { type: "string" },
    },
  });
  const command = positionals[0];

  if (
    positionals.length !== 1 ||
    (command !== "inspect" && command !== "record")
  ) {
    throw new Error(
      "Usage: flightdeck <inspect|record> --command <command> [--arg <argument>]",
    );
  }

  if (values.command === undefined || values.command.length === 0) {
    throw new Error("--command is required.");
  }

  const options = {
    command: values.command,
    args: values.arg ?? [],
    clientInfo: CLIENT_INFO,
    requestTimeoutMs: parseTimeout(values.timeout),
  };

  if (command === "inspect") {
    const report = await inspectStdioServer(options);
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  if (values.output === undefined || values.output.length === 0) {
    throw new Error("--output is required for record.");
  }

  return recordInspection(options, values.output);
}

async function recordInspection(
  options: Parameters<typeof inspectStdioServer>[0],
  outputPath: string,
): Promise<string> {
  const recorder = createEventRecorder({ transport: { kind: "stdio" } });
  const startedAt = new Date().toISOString();
  let failure: unknown;

  try {
    await inspectStdioServer({
      ...options,
      onMessage(direction, message) {
        recorder.record(direction, message);
      },
    });
  } catch (error: unknown) {
    failure = error;
  }

  const trace = createTraceDocument({
    id: randomUUID(),
    startedAt,
    status: failure === undefined ? "completed" : "interrupted",
    events: recorder.events,
  });
  await writeTraceDocument(outputPath, trace);

  if (failure !== undefined) {
    throw new Error(`Recording interrupted. Trace artifact: ${outputPath}.`);
  }

  return `${JSON.stringify(
    { path: outputPath, id: trace.id, status: trace.status },
    null,
    2,
  )}\n`;
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout must be a positive integer in milliseconds.");
  }

  return timeoutMs;
}

void run(process.argv.slice(2))
  .then((output) => {
    process.stdout.write(output);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`flightdeck: ${message}\n`);
    process.exitCode = 1;
  });
