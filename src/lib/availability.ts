import type { AssignmentValidation, AvailabilityBlock, ShiftType } from "./types";

export function findShiftAvailability(
  blocks: AvailabilityBlock[],
  employeeId: string,
  dayIndex: number,
  shiftType: ShiftType
) {
  return blocks.find(
    (block) =>
      block.employeeId === employeeId &&
      block.dayIndex === dayIndex &&
      block.shiftType === shiftType
  );
}

export function findTimeOff(
  blocks: AvailabilityBlock[],
  employeeId: string,
  dayIndex: number
) {
  return blocks.find(
    (block) =>
      block.employeeId === employeeId &&
      block.dayIndex === dayIndex &&
      block.status === "TIME_OFF"
  );
}

export function isUnavailableForShift(
  blocks: AvailabilityBlock[],
  employeeId: string,
  dayIndex: number,
  shiftType: ShiftType
) {
  if (findTimeOff(blocks, employeeId, dayIndex)) {
    return true;
  }
  return findShiftAvailability(blocks, employeeId, dayIndex, shiftType)?.status === "UNAVAILABLE";
}

export function getAssignmentAvailabilityHint(
  blocks: AvailabilityBlock[],
  employeeId: string,
  dayIndex: number,
  shiftType: ShiftType
) {
  if (isUnavailableForShift(blocks, employeeId, dayIndex, shiftType)) {
    return "לא זמין";
  }
  return findShiftAvailability(blocks, employeeId, dayIndex, shiftType)?.status === "PREFERRED"
    ? "מעוניין"
    : "";
}

export function availabilityStatusLabel(status: AvailabilityBlock["status"] | "AVAILABLE") {
  const labels = {
    AVAILABLE: "פנוי",
    UNAVAILABLE: "לא זמין",
    PREFERRED: "מעוניין לעבוד",
    TIME_OFF: "חופש"
  };
  return labels[status];
}

// For shifts changing hands between employees (swaps, giveaways): a vacation day is never
// allowed, and a shift the employee marked as unavailable needs confirmation.
export function getHandoverAvailabilityIssues(
  blocks: AvailabilityBlock[],
  employeeId: string,
  dayIndex: number,
  shiftType: ShiftType
): AssignmentValidation {
  if (findTimeOff(blocks, employeeId, dayIndex)) {
    return {
      errors: [{ code: "ON_VACATION", message: "העובד/ת בחופשה ביום הזה." }],
      warnings: []
    };
  }
  if (findShiftAvailability(blocks, employeeId, dayIndex, shiftType)?.status === "UNAVAILABLE") {
    return {
      errors: [],
      warnings: [{ code: "AVAILABILITY_BLOCKED", message: "העובד/ת סימן/ה שאינו/ה זמין/ה למשמרת הזו." }]
    };
  }
  return { errors: [], warnings: [] };
}
