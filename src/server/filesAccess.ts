import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getEncryptionKey } from "./secretKey";

const COOKIE_NAME = "wecomconnect_files_access";
const TOKEN_VERSION = "files-v1";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

interface FilesAccessPayload {
  expiresAt: number;
}

export function verifyFilesAccessCode(code: string): boolean {
  const configured = process.env.FILES_ACCESS_CODE?.trim();
  return Boolean(configured) && code.trim() === configured;
}

export async function hasFilesAccess(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return readFilesAccessToken(token);
}

export async function grantFilesAccess() {
  (await cookies()).set(COOKIE_NAME, signFilesAccessToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    priority: "high"
  });
}

export function signFilesAccessToken(): string {
  const payload: FilesAccessPayload = { expiresAt: Date.now() + MAX_AGE_SECONDS * 1000 };
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

export function readFilesAccessToken(token: string | undefined): boolean {
  if (!token) {
    return false;
  }

  try {
    const [version, encodedIv, encodedTag, encodedCiphertext] = token.split(".");
    if (version !== TOKEN_VERSION || !encodedIv || !encodedTag || !encodedCiphertext) {
      return false;
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
    const payload = JSON.parse(decrypted) as FilesAccessPayload;
    return Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}
