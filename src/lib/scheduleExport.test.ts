import { describe, expect, it } from "vitest";
import { buildScheduleCsv } from "./scheduleExport";

describe("buildScheduleCsv", () => {
  it("writes one sorted row per assignment with a BOM for Excel", () => {
    const csv = buildScheduleCsv(
      [
        { id: "2", userId: "b", shiftTemplateId: "m", teamId: "t", workDate: "2026-10-05", startsAt: "08:00", endsAt: "16:00" },
        { id: "1", userId: "a", shiftTemplateId: "m", teamId: "t", workDate: "2026-10-04", startsAt: "08:00", endsAt: "16:00" }
      ],
      [{ id: "m", teamId: "t", name: "בוקר, מוקדם", startsAt: "08:00", endsAt: "16:00", requiredCount: 1, weekdays: 127, sortOrder: 0, isActive: true }],
      new Map([["a", "אבי"], ["b", "בת"]])
    );
    const lines = csv.slice(1).split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[1]).toBe('אבי,ראשון,04.10,"בוקר, מוקדם",08:00,16:00,8');
    expect(lines[2].startsWith("בת,שני")).toBe(true);
  });
});
