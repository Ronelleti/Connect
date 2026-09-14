import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEncryptionKey } from "./secretKey";

const TOKEN_VERSION = "swap-v1";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export type SwapEmailAction = "approve_manager" | "decline_manager";

export interface SwapApprovalPayload {
  swapId: string;
  action: SwapEmailAction;
  summary: string;
  expiresAt: number;
}

export function signSwapApprovalToken(
  swapId: string,
  action: SwapEmailAction,
  summary: string
): string {
  const payload: SwapApprovalPayload = {
    swapId,
    action,
    summary,
    expiresAt: Date.now() + MAX_AGE_MS
  };
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), initializationVector);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const authenticationTag = cipher.getAuthTag();
  return [
    TOKEN_VERSION,
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

export function readSwapApprovalToken(token: string | null | undefined): SwapApprovalPayload | null {
  if (!token) {
    return null;
  }

  try {
    const [version, encodedIv, encodedTag, encodedCiphertext] = token.split(".");
    if (version !== TOKEN_VERSION || !encodedIv || !encodedTag || !encodedCiphertext) {
      return null;
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(encodedIv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
    const payload = JSON.parse(decrypted) as SwapApprovalPayload;
    if (
      !payload.swapId ||
      (payload.action !== "approve_manager" && payload.action !== "decline_manager") ||
      typeof payload.summary !== "string" ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
