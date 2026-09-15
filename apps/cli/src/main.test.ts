import { execFile, spawn } from "node:child_process";
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
