import { describe, expect, it } from "vitest";
import { buildSchedulePublishedMessage } from "./schedulePublish";

describe("buildSchedulePublishedMessage", () => {
  it("lists the employee's shifts in day and shift order", () => {
    const message = buildSchedulePublishedMessage(
      "2026-10-04",
      [
        { dayIndex: 2, shiftType: "EVENING" },
        { dayIndex: 0, shiftType: "NIGHT" },
        { dayIndex: 0, shiftType: "MORNING" }
      ],
      false
    );
    expect(message.title).toBe("הסידור לשבוע 04.10-10.10 מוכן");
    expect(message.body).toBe("יש לך 3 משמרות: ראשון 04.10 בוקר, ראשון 04.10 לילה, שלישי 06.10 ערב.");
    expect(message.link).toBe("/schedule?week=2026-10-04");
  });

  it("handles one shift and no shifts", () => {
    expect(buildSchedulePublishedMessage("2026-10-04", [{ dayIndex: 6, shiftType: "MORNING" }], false).body).toBe(
      "יש לך משמרת אחת: שבת 10.10 בוקר."
    );
    expect(buildSchedulePublishedMessage("2026-10-04", [], false).body).toBe("אין לך משמרות בשבוע זה.");
  });

  it("says the schedule was updated when publishing again", () => {
    expect(buildSchedulePublishedMessage("2026-10-04", [], true).title).toBe("הסידור לשבוע 04.10-10.10 עודכן");
  });
});
