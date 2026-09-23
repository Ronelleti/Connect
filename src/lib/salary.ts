import { toDateOnly } from "./dates";
import { SHIFT_DEFINITIONS } from "./shifts";
import type { ShiftType } from "./types";

// A pay period runs from the 20th of one month up to (not including) the 20th of the
// next month, and is paid on the 10th of the month after the period ends
// (e.g. 20.08-19.09 is paid on 10.10).
const PERIOD_START_DAY = 20;
const PAYDAY = 10;

export const NIGHT_PREMIUM_RATE = 1.25;
export const DEFAULT_TAX_CREDIT_POINTS = 2.25;

// Rough Israeli payroll figures (monthly, 2025 values; income tax brackets and the
// credit point value are frozen through 2027). The net pay they produce is an estimate
// only - the real payslip also depends on pension eligibility, other income, etc.
const INCOME_TAX_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 7010, rate: 0.1 },
  { upTo: 10060, rate: 0.14 },
  { upTo: 16150, rate: 0.2 },
  { upTo: 22440, rate: 0.31 },
  { upTo: 46690, rate: 0.35 },
  { upTo: 60130, rate: 0.47 },
  { upTo: Infinity, rate: 0.5 }
];
const TAX_CREDIT_POINT_VALUE = 242;
const SOCIAL_SECURITY_REDUCED_CEILING = 7522;
const SOCIAL_SECURITY_MAX_CEILING = 50695;
const SOCIAL_SECURITY_REDUCED_RATE = 0.0427; // national insurance 1.04% + health 3.23%
const SOCIAL_SECURITY_FULL_RATE = 0.12; // national insurance 7% + health 5%
const PENSION_EMPLOYEE_RATE = 0.06;

export interface PayPeriod {
  start: string;
  // Exclusive: the 20th of the following month.
  end: string;
  payday: string;
}

export interface SalaryEstimate {
  shiftCounts: Record<ShiftType, number>;
  regularHours: number;
  nightHours: number;
  gross: number;
  incomeTax: number;
  socialSecurity: number;
  pension: number;
  net: number;
}

export function getPayPeriod(todayDateOnly: string, offset = 0): PayPeriod {
  const [year, month, day] = todayDateOnly.split("-").map(Number);
  const startMonthIndex = (day >= PERIOD_START_DAY ? month - 1 : month - 2) + offset;
  return {
    start: toDateOnly(new Date(Date.UTC(year, startMonthIndex, PERIOD_START_DAY))),
    end: toDateOnly(new Date(Date.UTC(year, startMonthIndex + 1, PERIOD_START_DAY))),
    payday: toDateOnly(new Date(Date.UTC(year, startMonthIndex + 2, PAYDAY)))
  };
}

export function estimateSalary(
  shiftTypes: ShiftType[],
  hourlyWage: number,
  taxCreditPoints = DEFAULT_TAX_CREDIT_POINTS
): SalaryEstimate {
  const shiftCounts: Record<ShiftType, number> = { MORNING: 0, EVENING: 0, NIGHT: 0 };
  for (const shiftType of shiftTypes) {
    shiftCounts[shiftType] += 1;
  }

  const nightHours = shiftCounts.NIGHT * SHIFT_DEFINITIONS.NIGHT.hours;
  const regularHours =
    shiftCounts.MORNING * SHIFT_DEFINITIONS.MORNING.hours +
    shiftCounts.EVENING * SHIFT_DEFINITIONS.EVENING.hours;
  const gross = roundMoney(
    regularHours * hourlyWage + nightHours * hourlyWage * NIGHT_PREMIUM_RATE
  );

  const incomeTax = roundMoney(
    Math.max(0, bracketTax(gross) - taxCreditPoints * TAX_CREDIT_POINT_VALUE)
  );
  const socialSecurity = roundMoney(socialSecurityDeduction(gross));
  const pension = roundMoney(gross * PENSION_EMPLOYEE_RATE);

  return {
    shiftCounts,
    regularHours,
    nightHours,
    gross,
    incomeTax,
    socialSecurity,
    pension,
    net: roundMoney(gross - incomeTax - socialSecurity - pension)
  };
}

function bracketTax(income: number): number {
  let tax = 0;
  let lowerBound = 0;
  for (const bracket of INCOME_TAX_BRACKETS) {
    if (income <= lowerBound) {
      break;
    }
    tax += (Math.min(income, bracket.upTo) - lowerBound) * bracket.rate;
    lowerBound = bracket.upTo;
  }
  return tax;
}

function socialSecurityDeduction(income: number): number {
  const reducedPart = Math.min(income, SOCIAL_SECURITY_REDUCED_CEILING);
  const fullPart =
    Math.min(income, SOCIAL_SECURITY_MAX_CEILING) - SOCIAL_SECURITY_REDUCED_CEILING;
  return (
    reducedPart * SOCIAL_SECURITY_REDUCED_RATE + Math.max(0, fullPart) * SOCIAL_SECURITY_FULL_RATE
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
