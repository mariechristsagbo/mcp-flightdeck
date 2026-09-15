import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ProtocolEvent } from "../../protocol/src/protocol-event.js";
import { createTraceDocument } from "./trace-document.js";
import { readTraceDocument, writeTraceDocument } from "./trace-file-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
  );
});

function createTrace() {
  return createTraceDocument({
    id: "run_01",
    startedAt: "2026-09-15T08:00:00.000Z",
    status: "completed",
    events: [createEvent(1, 0), createEvent(2, 421)],
  });
}

function createEvent(sequence: number, atMs: number): ProtocolEvent {
  return {
    sequence,
    atMs,
    direction: sequence % 2 === 0 ? "inbound" : "outbound",
    transport: {
      kind: "stdio",
    },
    message:
      sequence % 2 === 0
        ? {
            kind: "response",
            id: "initialize-1",
            result: {},
          }
        : {
            kind: "request",
            id: "initialize-1",
            method: "initialize",
          },
    redactions: [],
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "mcp-flightdeck-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("trace file store", () => {
  it("writes and reads a trace through a nested artifact path", async () => {
    const directory = await createTemporaryDirectory();
    const path = join(directory, ".flightdeck", "runs", "run_01.fdtrace.json");
    const trace = createTrace();

    await writeTraceDocument(path, trace);

    await expect(readTraceDocument(path)).resolves.toEqual(trace);
    await expect(readFile(path, "utf8")).resolves.toContain(
      '"formatVersion": 1',
    );
  });

  it("creates new trace artifacts with owner-only permissions", async () => {
    const directory = await createTemporaryDirectory();
    const path = join(directory, "run_01.fdtrace.json");

    await writeTraceDocument(path, createTrace());

    await expect(stat(path)).resolves.toMatchObject({
      mode: expect.any(Number),
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("refuses to overwrite an existing trace by default", async () => {
    const directory = await createTemporaryDirectory();
    const path = join(directory, "run_01.fdtrace.json");

    await writeTraceDocument(path, createTrace());

    await expect(writeTraceDocument(path, createTrace())).rejects.toThrow(
      `Trace artifact already exists: ${path}`,
    );
  });
});
