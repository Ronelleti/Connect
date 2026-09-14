import { findShiftAvailability, isUnavailableForShift } from "./availability";
import { MAX_WEEKLY_SHIFTS, getShiftTypes } from "./shifts";
import type { AvailabilityBlock, Employee, ShiftAssignment, ShiftType } from "./types";

// Shifts run Morning -> Evening -> Night -> Morning (next day) as one continuous weekly
// sequence. Requiring a gap of 3 slots between an employee's shifts means at least two
// other shifts must pass in between (>=16h rest), which also rules out back-to-back shifts.
const MIN_REST_SLOT_GAP = 3;
const RELAXED_SLOT_GAP = 1;

export interface AutoScheduleSlot {
  dayIndex: number;
  shiftType: ShiftType;
}

export interface AutoScheduleAssignment extends AutoScheduleSlot {
  employeeId: string;
  weekStart: string;
}

export interface AutoScheduleResult {
  created: AutoScheduleAssignment[];
  unfilled: AutoScheduleSlot[];
  relaxedRest: (AutoScheduleSlot & { employeeId: string })[];
}

export function generateWeeklySchedule(
  weekStart: string,
  employees: Employee[],
  existingAssignments: ShiftAssignment[],
  availabilityBlocks: AvailabilityBlock[]
): AutoScheduleResult {
  const shiftTypes = getShiftTypes();
  const activeEmployees = employees.filter((employee) => employee.isActive);

  const slotsByEmployee = new Map<string, number[]>();
  const countByEmployee = new Map<string, number>();
  for (const employee of activeEmployees) {
    slotsByEmployee.set(employee.id, []);
    countByEmployee.set(employee.id, 0);
  }
  for (const assignment of existingAssignments) {
    if (!slotsByEmployee.has(assignment.employeeId)) {
      continue;
    }
    slotsByEmployee.get(assignment.employeeId)!.push(slotIndex(assignment.dayIndex, assignment.shiftType, shiftTypes));
    countByEmployee.set(assignment.employeeId, (countByEmployee.get(assignment.employeeId) ?? 0) + 1);
  }

  const occupied = new Set(
    existingAssignments.map((assignment) => cellKey(assignment.dayIndex, assignment.shiftType))
  );

  const created: AutoScheduleAssignment[] = [];
  const unfilled: AutoScheduleSlot[] = [];
  const relaxedRest: (AutoScheduleSlot & { employeeId: string })[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    for (const shiftType of shiftTypes) {
      if (occupied.has(cellKey(dayIndex, shiftType))) {
        continue;
      }

      const targetSlot = slotIndex(dayIndex, shiftType, shiftTypes);
      const context = { dayIndex, shiftType, targetSlot, slotsByEmployee, countByEmployee, availabilityBlocks };

      let chosen = selectCandidate(activeEmployees, { ...context, minGap: MIN_REST_SLOT_GAP });
      let usedRelaxedRest = false;
      if (!chosen) {
        chosen = selectCandidate(activeEmployees, { ...context, minGap: RELAXED_SLOT_GAP });
        usedRelaxedRest = Boolean(chosen);
      }

      if (!chosen) {
        unfilled.push({ dayIndex, shiftType });
        continue;
      }

      created.push({ employeeId: chosen.id, weekStart, dayIndex, shiftType });
      slotsByEmployee.get(chosen.id)!.push(targetSlot);
      countByEmployee.set(chosen.id, (countByEmployee.get(chosen.id) ?? 0) + 1);
      if (usedRelaxedRest) {
        relaxedRest.push({ employeeId: chosen.id, dayIndex, shiftType });
      }
    }
  }

  return { created, unfilled, relaxedRest };
}

interface CandidateContext {
  dayIndex: number;
  shiftType: ShiftType;
  targetSlot: number;
  minGap: number;
  slotsByEmployee: Map<string, number[]>;
  countByEmployee: Map<string, number>;
  availabilityBlocks: AvailabilityBlock[];
}

function selectCandidate(employees: Employee[], context: CandidateContext): Employee | null {
  const eligible = employees.filter((employee) => isEligible(employee, context));

  if (eligible.length === 0) {
    return null;
  }

  eligible.sort((a, b) => compareCandidates(a, b, context));
  return eligible[0];
}

function isEligible(employee: Employee, context: CandidateContext): boolean {
  if (isUnavailableForShift(context.availabilityBlocks, employee.id, context.dayIndex, context.shiftType)) {
    return false;
  }

  const weeklyLimit = Math.min(employee.weeklyMaxShifts, MAX_WEEKLY_SHIFTS);
  if ((context.countByEmployee.get(employee.id) ?? 0) >= weeklyLimit) {
    return false;
  }

  const assignedSlots = context.slotsByEmployee.get(employee.id) ?? [];
  return assignedSlots.every((slot) => Math.abs(slot - context.targetSlot) >= context.minGap);
}

function compareCandidates(a: Employee, b: Employee, context: CandidateContext): number {
  const preferredA = isPreferred(context.availabilityBlocks, a.id, context.dayIndex, context.shiftType);
  const preferredB = isPreferred(context.availabilityBlocks, b.id, context.dayIndex, context.shiftType);
  if (preferredA !== preferredB) {
    return preferredA ? -1 : 1;
  }

  const countA = context.countByEmployee.get(a.id) ?? 0;
  const countB = context.countByEmployee.get(b.id) ?? 0;
  const belowMinA = countA < a.weeklyMinShifts;
  const belowMinB = countB < b.weeklyMinShifts;
  if (belowMinA !== belowMinB) {
    return belowMinA ? -1 : 1;
  }

  if (countA !== countB) {
    return countA - countB;
  }

  return a.name.localeCompare(b.name, "he");
}

function isPreferred(
  blocks: AvailabilityBlock[],
  employeeId: string,
  dayIndex: number,
  shiftType: ShiftType
): boolean {
  return findShiftAvailability(blocks, employeeId, dayIndex, shiftType)?.status === "PREFERRED";
}

function slotIndex(dayIndex: number, shiftType: ShiftType, shiftTypes: ShiftType[]): number {
  return dayIndex * shiftTypes.length + shiftTypes.indexOf(shiftType);
}

function cellKey(dayIndex: number, shiftType: ShiftType): string {
  return `${dayIndex}-${shiftType}`;
}
