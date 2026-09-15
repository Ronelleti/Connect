import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { extractTextFromFile } from "./fileText";

describe("extractTextFromFile", () => {
  it("reads plain text files directly", async () => {
    const buffer = Buffer.from("שלום עולם\nline two", "utf8");
    const text = await extractTextFromFile(buffer, "notes.txt", "text/plain");
    expect(text).toBe("שלום עולם\nline two");
  });

  it("reads csv files directly", async () => {
    const buffer = Buffer.from("name,hours\nNoa,32", "utf8");
    const text = await extractTextFromFile(buffer, "report.csv", "text/csv");
    expect(text).toBe("name,hours\nNoa,32");
  });

  it("extracts cell values from an xlsx workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Shifts");
    sheet.addRow(["Employee", "Shift Count"]);
    sheet.addRow(["Noa Cohen", 5]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const text = await extractTextFromFile(
      buffer,
      "shifts.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    expect(text).toContain("Shifts");
    expect(text).toContain("Employee | Shift Count");
    expect(text).toContain("Noa Cohen | 5");
  });

  it("returns an empty string for unsupported file types", async () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02]);
    const text = await extractTextFromFile(buffer, "archive.zip", "application/zip");
    expect(text).toBe("");
  });

  it("truncates very long extracted text with a marker", async () => {
    const buffer = Buffer.from("a".repeat(60_000), "utf8");
    const text = await extractTextFromFile(buffer, "big.txt", "text/plain");
    expect(text.length).toBeLessThan(60_000);
    expect(text.endsWith("...(truncated)")).toBe(true);
  });
});
