import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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

  it("rejects a persisted event with an invalid direction", async () => {
    const directory = await createTemporaryDirectory();
    const path = join(directory, "invalid-direction.fdtrace.json");

    await writeFile(
      path,
      JSON.stringify({
        ...createTrace(),
        events: [
          {
            ...createEvent(1, 0),
            direction: "sideways",
          },
        ],
        durationMs: 0,
      }),
    );

    await expect(readTraceDocument(path)).rejects.toThrow(
      `Invalid trace artifact: ${path}`,
    );
  });

  it("rejects a persisted trace with non-contiguous event sequences", async () => {
    const directory = await createTemporaryDirectory();
    const path = join(directory, "invalid-sequence.fdtrace.json");

    await writeFile(
      path,
      JSON.stringify({
        ...createTrace(),
        events: [createEvent(1, 0), createEvent(3, 421)],
      }),
    );

    await expect(readTraceDocument(path)).rejects.toThrow(
      `Invalid trace artifact: ${path}`,
    );
  });

  it("rejects a persisted trace with an inconsistent duration", async () => {
    const directory = await createTemporaryDirectory();
    const path = join(directory, "invalid-duration.fdtrace.json");

    await writeFile(
      path,
      JSON.stringify({
        ...createTrace(),
        durationMs: 420,
      }),
    );

    await expect(readTraceDocument(path)).rejects.toThrow(
      `Invalid trace artifact: ${path}`,
    );
  });

  it("redacts credentials before writing an artifact", async () => {
    const directory = await createTemporaryDirectory();
    const path = join(directory, "secrets.fdtrace.json");
    const trace = createTraceDocument({
      id: "run_secrets",
      startedAt: "2026-09-15T08:00:00.000Z",
      status: "completed",
      events: [
        {
          sequence: 1,
          atMs: 0,
          direction: "outbound",
          transport: { kind: "stdio" },
          message: {
            kind: "request",
            id: "call-1",
            method: "tools/call",
            params: {
              authorization: "Bearer super-secret-token",
              email: "customer@example.com",
            },
          },
          redactions: [],
        },
      ],
    });

    await writeTraceDocument(path, trace);

    const artifact = await readFile(path, "utf8");
    expect(artifact).not.toContain("super-secret-token");
    expect(artifact).toContain("[REDACTED]");

    const reloaded = await readTraceDocument(path);
    expect(reloaded.events[0]?.message).toEqual({
      kind: "request",
      id: "call-1",
      method: "tools/call",
      params: { authorization: "[REDACTED]", email: "customer@example.com" },
    });
    expect(reloaded.events[0]?.redactions).toEqual([
      {
        path: "$.events[0].message.params.authorization",
        reason: "sensitive",
      },
    ]);
  });
});
