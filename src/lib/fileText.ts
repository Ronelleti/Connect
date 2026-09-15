export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 50_000;

export async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";

  try {
    if (extension === "pdf" || contentType === "application/pdf") {
      return truncate(await extractPdfText(buffer));
    }
    if (extension === "docx" || contentType.includes("wordprocessingml")) {
      return truncate(await extractDocxText(buffer));
    }
    if (extension === "csv" || contentType === "text/csv") {
      return truncate(buffer.toString("utf8"));
    }
    if (
      ["xlsx", "xlsm"].includes(extension) ||
      contentType.includes("spreadsheetml")
    ) {
      return truncate(await extractExcelText(buffer));
    }
    if (extension === "txt" || contentType.startsWith("text/")) {
      return truncate(buffer.toString("utf8"));
    }
  } catch (error) {
    console.error(`Failed to extract text from uploaded file "${filename}"`, error);
  }

  return "";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractExcelText(buffer: Buffer): Promise<string> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  // exceljs resolves its Buffer type against an older @types/node pulled in transitively
  // via fast-csv, which TypeScript treats as structurally distinct from the project's
  // Buffer type even though both describe the same runtime Node Buffer.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`# ${sheet.name}`);
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      lines.push(values.map(cellToString).join(" | "));
    });
  });
  return lines.join("\n");
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    const richText = (value as { richText?: { text: string }[] }).richText;
    if (Array.isArray(richText)) {
      return richText.map((part) => part.text).join("");
    }
    const result = (value as { result?: unknown }).result;
    if (result !== undefined) {
      return cellToString(result);
    }
    const text = (value as { text?: unknown }).text;
    if (text !== undefined) {
      return cellToString(text);
    }
  }
  return String(value);
}

function truncate(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EXTRACTED_TEXT_CHARS
    ? `${trimmed.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n...(truncated)`
    : trimmed;
}
