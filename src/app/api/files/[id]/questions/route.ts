import { NextResponse } from "next/server";
import { answerQuestionAboutDocument, isAiConfigured } from "@/server/ai";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { hasFilesAccess } from "@/server/filesAccess";
import { createFileQuestion, findSharedFileWithData, listFileQuestions } from "@/server/repositories";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  if (!(await hasFilesAccess())) {
    return jsonError("נדרש קוד גישה לקבצים המשותפים.", 423);
  }

  const { id } = await context.params;
  const questions = await listFileQuestions(id);
  return NextResponse.json({ questions });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  if (!(await hasFilesAccess())) {
    return jsonError("נדרש קוד גישה לקבצים המשותפים.", 423);
  }

  if (!isAiConfigured()) {
    return jsonError("שירות השאלות על קבצים לא הוגדר במערכת. יש להגדיר ANTHROPIC_API_KEY.", 503);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  if (!question) {
    return jsonError("יש להזין שאלה.");
  }

  const file = await findSharedFileWithData(id);
  if (!file) {
    return jsonError("הקובץ לא נמצא.", 404);
  }

  let answer: string;
  try {
    answer = await answerQuestionAboutDocument(file.extractedText, question);
  } catch (error) {
    console.error("Failed to answer question about file", error);
    return jsonError("קרתה שגיאה בקבלת תשובה. נסו שוב מאוחר יותר.", 502);
  }

  const record = await createFileQuestion({
    fileId: id,
    askedByUserId: user.id,
    askedByName: user.name,
    question,
    answer
  });

  return NextResponse.json({ question: record }, { status: 201 });
}
