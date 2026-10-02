import { describe, expect, it } from "vitest";
import { buildSchedulePublishedMessage } from "./schedulePublish";

describe("buildSchedulePublishedMessage", () => {
  it("lists the person's shifts in order with their hours", () => {
    const message = buildSchedulePublishedMessage(
      "2026-10-04",
      "team-1",
      "תמיכה Tier 1",
      [
        { workDate: "2026-10-06", shiftName: "ערב", startsAt: "14:00", endsAt: "22:00" },
        { workDate: "2026-10-04", shiftName: "בוקר", startsAt: "08:00", endsAt: "16:00" }
      ],
      false
    );
    expect(message.title).toBe("הסידור של תמיכה Tier 1 לשבוע 04.10-10.10 מוכן");
    expect(message.body).toBe("יש לך 2 משמרות: ראשון 04.10 בוקר 08:00-16:00, שלישי 06.10 ערב 14:00-22:00.");
    expect(message.link).toBe("/schedule?week=2026-10-04&team=team-1");
  });

  it("handles no shifts and updates", () => {
    const message = buildSchedulePublishedMessage("2026-10-04", "t", "מכירות", [], true);
    expect(message.title).toBe("הסידור של מכירות לשבוע 04.10-10.10 עודכן");
    expect(message.body).toBe("אין לך משמרות בשבוע זה.");
  });
});
