import { InputError } from "./input-error.js";

export function record(
  value: unknown,
  field = "request",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("Ожидается объект с данными.", field);
  }
  return value as Record<string, unknown>;
}

export function onlyKeys(
  value: Record<string, unknown>,
  keys: string[],
  field: string,
): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new InputError("Переданы неизвестные поля.", field);
  }
}

export function text(
  value: unknown,
  field: string,
  min: number,
  max: number,
  message: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  ) {
    throw new InputError(message, field);
  }
  return value.trim();
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isIntegerInRange(
  value: unknown,
  min: number,
  max: number,
): boolean {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}
