import { createHash } from "node:crypto";

export function getAuthSecret(): string {
  const configuredSecret = process.env.AUTH_SECRET?.trim();
  if (configuredSecret) {
    return configuredSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  return "development-only-secret";
}

export function getEncryptionKey(): Buffer {
  return createHash("sha256").update(getAuthSecret()).digest();
}
