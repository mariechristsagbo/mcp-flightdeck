/**
 * JSON value shapes and guards shared by every boundary that accepts untrusted
 * protocol data.
 *
 * A transport frame parser and a persisted-artifact parser must agree on what a
 * valid JSON value is, so those checks live here instead of drifting apart per
 * layer. None of these guards coerce: a value that is not JSON is rejected
 * rather than converted.
 */

export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export interface JsonArray extends ReadonlyArray<JsonValue> {}

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    Number.isFinite(value)
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isRecord(value) && Object.values(value).every(isJsonValue);
}

export function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
