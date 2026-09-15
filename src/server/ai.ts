import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_ANSWER_TOKENS = 1024;

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required to answer questions about files.");
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export async function answerQuestionAboutDocument(
  documentText: string,
  question: string
): Promise<string> {
  const client = getClient();
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

  const documentSection = documentText.trim()
    ? documentText
    : "(No text could be extracted from this file.)";

  const message = await client.messages.create({
    model,
    max_tokens: MAX_ANSWER_TOKENS,
    system:
      "You answer questions about an uploaded document for a shift-scheduling team. " +
      "Answer using only the document content provided below. If the answer isn't in the " +
      "document, say so clearly instead of guessing. Answer in the same language as the question.",
    messages: [
      {
        role: "user",
        content: `Document content:\n"""\n${documentSection}\n"""\n\nQuestion: ${question}`
      }
    ]
  });

  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  return textBlock?.text.trim() || "לא התקבלה תשובה מהמערכת.";
}
