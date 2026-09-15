import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import {
  serializeTraceDocument,
  type TraceDocument,
  type TraceStatus,
} from "./trace-document.js";

const TRACE_FILE_MODE = 0o600;

export async function writeTraceDocument(
  path: string,
  trace: TraceDocument,
): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = join(
    directory,
    `.${basename(path)}.${randomUUID()}.tmp`,
  );

  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, `${serializeTraceDocument(trace)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: TRACE_FILE_MODE,
  });

  try {
    await link(temporaryPath, path);
  } catch (error: unknown) {
    if (hasCode(error, "EEXIST")) {
      throw new Error(`Trace artifact already exists: ${path}`);
    }

    throw error;
  } finally {
    await unlink(temporaryPath).catch((error: unknown) => {
      if (!hasCode(error, "ENOENT")) {
        throw error;
      }
    });
  }
}

export async function readTraceDocument(path: string): Promise<TraceDocument> {
  const serializedTrace = await readFile(path, "utf8");
  const parsedTrace: unknown = JSON.parse(serializedTrace);

  if (!isTraceDocument(parsedTrace)) {
    throw new Error(`Invalid trace artifact: ${path}`);
  }

  return parsedTrace;
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function isTraceDocument(value: unknown): value is TraceDocument {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.formatVersion === 1 &&
    typeof value.id === "string" &&
    typeof value.startedAt === "string" &&
    isTraceStatus(value.status) &&
    typeof value.durationMs === "number" &&
    Array.isArray(value.events)
  );
}

function isTraceStatus(value: unknown): value is TraceStatus {
  return value === "completed" || value === "interrupted";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
