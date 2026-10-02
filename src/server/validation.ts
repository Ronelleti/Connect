import { isValidTime } from "@/lib/shiftTime";
import type { ShiftTemplateInput } from "./org";

export function cleanName(value: unknown, max = 60): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= max ? name : null;
}

function intInRange(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isInteger(number) && number >= min && number <= max ? number : null;
}

/** Validates a full (create) or partial (update) shift definition. */
export function parseShiftTemplateInput(
  body: Record<string, unknown>,
  partial: boolean
): { value: Partial<ShiftTemplateInput>; error: string | null } {
  const value: Partial<ShiftTemplateInput> = {};
  const has = (key: string) => body[key] !== undefined;

  if (has("name") || !partial) {
    const name = cleanName(body.name, 40);
    if (!name) {
      return { value, error: "יש לתת שם למשמרת (עד 40 תווים)." };
    }
    value.name = name;
  }
  for (const key of ["startsAt", "endsAt"] as const) {
    if (has(key) || !partial) {
      if (!isValidTime(body[key])) {
        return { value, error: "שעות המשמרת אינן תקינות." };
      }
      value[key] = body[key] as string;
    }
  }
  if (value.startsAt && value.endsAt && value.startsAt === value.endsAt) {
    return { value, error: "שעת הסיום חייבת להיות שונה משעת ההתחלה." };
  }
  if (has("requiredCount") || !partial) {
    const count = intInRange(body.requiredCount ?? 1, 0, 200);
    if (count === null) {
      return { value, error: "מספר העובדים הנדרש חייב להיות בין 0 ל-200." };
    }
    value.requiredCount = count;
  }
  if (has("weekdays") || !partial) {
    const weekdays = intInRange(body.weekdays ?? 127, 1, 127);
    if (weekdays === null) {
      return { value, error: "יש לבחור לפחות יום אחד." };
    }
    value.weekdays = weekdays;
  }
  if (has("sortOrder") || !partial) {
    value.sortOrder = intInRange(body.sortOrder ?? 0, -1000, 1000) ?? 0;
  }
  return { value, error: null };
}

export function parseColorSlot(value: unknown): number | null {
  return intInRange(value, 1, 8);
}
