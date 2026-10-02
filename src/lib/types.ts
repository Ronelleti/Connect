import type { Permission, Role } from "./permissions";

export type { Permission, Role };

export type AvailabilityStatus = "UNAVAILABLE" | "PREFERRED" | "TIME_OFF";

export type SwapStatus =
  | "PENDING_EMPLOYEE"
  | "DECLINED_BY_EMPLOYEE"
  | "PENDING_MANAGER"
  | "DECLINED_BY_MANAGER"
  | "CANCELLED"
  | "APPROVED";

export type GiveawayStatus = "OPEN" | "PENDING_MANAGER" | "APPROVED" | "DECLINED_BY_MANAGER" | "CANCELLED";

export type VacationStatus = "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";

/** The signed-in person, with what they're allowed to do. */
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
  teamId: string | null;
  /** Extra permissions switched on for this person (on top of the role's defaults). */
  extraPermissions: Permission[];
}

export interface Department {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  departmentId: string;
  name: string;
  /** Fixed chart color slot, 1-8. */
  colorSlot: number;
}

export interface Person {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
  teamId: string | null;
  title: string;
  weeklyMinHours: number;
  weeklyMaxHours: number;
  isActive: boolean;
  extraPermissions: Permission[];
}

export interface ShiftTemplate {
  id: string;
  teamId: string;
  name: string;
  /** "HH:MM"; an end earlier than the start means the shift ends the next day. */
  startsAt: string;
  endsAt: string;
  requiredCount: number;
  /** Bit mask of the days the shift runs: bit 0 = Sunday ... bit 6 = Saturday. */
  weekdays: number;
  sortOrder: number;
  isActive: boolean;
}

export interface Assignment {
  id: string;
  userId: string;
  shiftTemplateId: string;
  teamId: string;
  /** "YYYY-MM-DD" */
  workDate: string;
  startsAt: string;
  endsAt: string;
}

export interface AvailabilityEntry {
  id: string;
  userId: string;
  workDate: string;
  /** null = the whole day. */
  shiftTemplateId: string | null;
  status: AvailabilityStatus;
  note: string;
}

export interface Issue {
  code: string;
  message: string;
}

export interface Validation {
  errors: Issue[];
  warnings: Issue[];
}

export interface SwapRequest {
  id: string;
  requesterAssignmentId: string | null;
  targetAssignmentId: string | null;
  requesterId: string;
  requesterName: string;
  targetUserId: string;
  targetUserName: string;
  teamId: string;
  shiftLabel: string;
  targetShiftLabel: string | null;
  status: SwapStatus;
  createdAt: string;
}

export interface Giveaway {
  id: string;
  assignmentId: string;
  offeredBy: string;
  offeredByName: string;
  takenBy: string | null;
  takenByName: string | null;
  teamId: string;
  workDate: string;
  shiftName: string;
  startsAt: string;
  endsAt: string;
  status: GiveawayStatus;
  createdAt: string;
}

export interface VacationRequest {
  id: string;
  userId: string;
  userName: string;
  teamId: string | null;
  startDate: string;
  endDate: string;
  note: string;
  status: VacationStatus;
  removedShiftCount: number;
  createdAt: string;
}

export interface SharedFile {
  id: string;
  uploadedByUserId: string | null;
  uploadedByName: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}
