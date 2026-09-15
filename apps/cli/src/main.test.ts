import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const CLI_ENTRYPOINT = fileURLToPath(
  new URL("../../../dist/apps/cli/src/main.js", import.meta.url),
);
const FIXTURE_SERVER = fileURLToPath(
  new URL("../../../packages/fixtures/src/echo-server.ts", import.meta.url),
);

beforeAll(async () => {
  await execFileAsync("npm", ["run", "build", "--silent"], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
  });
});

describe("flightdeck inspect", () => {
  it("prints a JSON inspection report for a stdio MCP server", async () => {
    const result = await runCli([
      "inspect",
      "--command",
      process.execPath,
      "--arg",
      FIXTURE_SERVER,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "flightdeck-fixture", version: "0.0.0" },
      capabilities: { tools: {} },
      tools: [
        {
          name: "echo",
          description: "Echoes the provided arguments.",
        },
      ],
    });
  });

  it("reports invalid command usage on stderr", async () => {
    const result = await runCli(["inspect"]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--command is required");
  });
});

describe("flightdeck record", () => {
  it("persists a completed stdio inspection trace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flightdeck-record-"));
    const output = join(directory, "inspection.fdtrace.json");

    try {
      const result = await runCli([
        "record",
        "--command",
        process.execPath,
        "--arg",
        FIXTURE_SERVER,
        "--output",
        output,
      ]);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        path: output,
        status: "completed",
      });

      const trace = JSON.parse(await readFile(output, "utf8")) as {
        events: { direction: string; message: { kind: string } }[];
        status: string;
      };
      expect(trace.status).toBe("completed");
      expect(trace.events).toEqual([
        expect.objectContaining({
          direction: "outbound",
          message: {
            kind: "request",
            id: "initialize-1",
            method: "initialize",
            params: expect.any(Object),
          },
        }),
        expect.objectContaining({
          direction: "inbound",
          message: {
            kind: "response",
            id: "initialize-1",
            result: expect.any(Object),
          },
        }),
        expect.objectContaining({
          direction: "outbound",
          message: {
            kind: "notification",
            method: "notifications/initialized",
          },
        }),
        expect.objectContaining({
          direction: "outbound",
          message: {
            kind: "request",
            id: "tools-list-2",
            method: "tools/list",
          },
        }),
        expect.objectContaining({
          direction: "inbound",
          message: {
            kind: "response",
            id: "tools-list-2",
            result: expect.any(Object),
          },
        }),
      ]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("persists an interrupted trace when inspection fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flightdeck-record-"));
    const output = join(directory, "interrupted.fdtrace.json");

    try {
      const result = await runCli([
        "record",
        "--command",
        process.execPath,
        "--arg",
        join(directory, "missing-server.ts"),
        "--output",
        output,
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(`Trace artifact: ${output}`);
      expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({
        status: "interrupted",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("requires an output path", async () => {
    const result = await runCli(["record", "--command", process.execPath]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--output is required");
  });
});

function runCli(args: readonly string[]): Promise<{
  code: number | null;
  stderr: string;
  stdout: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_ENTRYPOINT, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data: string) => {
      stdout += data;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data: string) => {
      stderr += data;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
