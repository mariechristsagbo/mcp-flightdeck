import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { parseTraceDocument } from "./trace-document-parser.js";
import {
  serializeTraceDocument,
  type TraceDocument,
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
  const parsedTrace = parseSerializedTrace(serializedTrace);
  const trace = parseTraceDocument(parsedTrace);

  if (trace === null) {
    throw new Error(`Invalid trace artifact: ${path}`);
  }

  return trace;
}

function parseSerializedTrace(serializedTrace: string): unknown {
  try {
    return JSON.parse(serializedTrace);
  } catch {
    return null;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
