import { parseArgs } from "node:util";

import { inspectStdioServer } from "../../../packages/inspect/src/inspect-server.js";

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
      timeout: { type: "string" },
    },
  });

  if (positionals.length !== 1 || positionals[0] !== "inspect") {
    throw new Error(
      "Usage: flightdeck inspect --command <command> [--arg <argument>]",
    );
  }

  if (values.command === undefined || values.command.length === 0) {
    throw new Error("--command is required.");
  }

  const requestTimeoutMs = parseTimeout(values.timeout);
  const report = await inspectStdioServer({
    command: values.command,
    args: values.arg ?? [],
    clientInfo: CLIENT_INFO,
    requestTimeoutMs,
  });

  return `${JSON.stringify(report, null, 2)}\n`;
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
