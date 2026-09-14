import { describe, expect, it } from "vitest";
import { schedulePdfFilename } from "./schedulePdf";

describe("schedulePdfFilename", () => {
  it("includes the exported week in a PDF filename", () => {
    expect(schedulePdfFilename("2026-07-19")).toBe("wecomconnect-schedule-2026-07-19.pdf");
  });
});
