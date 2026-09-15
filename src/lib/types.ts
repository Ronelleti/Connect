export type Role = "MANAGER" | "EMPLOYEE";

export type ShiftType = "MORNING" | "EVENING" | "NIGHT";

export type AvailabilityStatus = "UNAVAILABLE" | "PREFERRED" | "TIME_OFF";

export type SwapStatus =
  | "PENDING_EMPLOYEE"
  | "DECLINED_BY_EMPLOYEE"
  | "PENDING_MANAGER"
  | "DECLINED_BY_MANAGER"
  | "SUPERSEDED"
  | "APPROVED";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Employee {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  roleTitle: string;
  weeklyMinShifts: number;
  weeklyMaxShifts: number;
  isActive: boolean;
}

export interface AvailabilityBlock {
  id: string;
  employeeId: string;
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType | null;
  startsAt: string | null;
  endsAt: string | null;
  reason: string;
  status: AvailabilityStatus;
}

export interface ShiftAssignment {
  id: string;
  employeeId: string;
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
  notes: string;
}

export interface ShiftSwapRequest {
  id: string;
  requesterAssignmentId: string | null;
  requesterEmployeeId?: string;
  requesterEmployeeName?: string;
  targetEmployeeId: string;
  targetEmployeeName?: string;
  targetAssignmentId: string | null;
  weekStart?: string;
  dayIndex?: number;
  shiftType?: ShiftType;
  targetDayIndex?: number | null;
  targetShiftType?: ShiftType | null;
  status: SwapStatus;
  employeeDecidedAt: string | null;
  managerDecidedAt: string | null;
  createdAt: string;
}

export interface AssignmentInput {
  employeeId: string;
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
}

export interface AssignmentIssue {
  code: string;
  message: string;
}

export interface AssignmentValidation {
  errors: AssignmentIssue[];
  warnings: AssignmentIssue[];
}

export interface EmployeeSummary {
  employeeId: string;
  shiftCount: number;
  workHours: number;
  minShifts: number;
  maxShifts: number;
}

export interface UpcomingShift {
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
  startsAt: string;
}

export interface EmployeeDashboardStats {
  employeeName: string;
  weekShiftCount: number;
  weekHours: number;
  monthShiftCount: number;
  monthHours: number;
  nextShift: UpcomingShift | null;
}

export interface SharedFile {
  id: string;
  uploadedByUserId: string | null;
  uploadedByName: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  hasExtractedText: boolean;
  createdAt: string;
}

export interface FileQuestion {
  id: string;
  fileId: string;
  askedByUserId: string | null;
  askedByName: string;
  question: string;
  answer: string;
  createdAt: string;
}
