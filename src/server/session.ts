import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import { cookies } from "next/headers";
import type { Role, User } from "@/lib/types";

const COOKIE_NAME = "wecomconnect_session";
const SESSION_VERSION = "v1";
const MAX_AGE_SECONDS = 60 * 60 * 8;

interface SessionPayload {
  id: string;
  email: string;
  name: string;
  role: Role;
  expiresAt: number;
}

export function signSession(user: User): string {
  const payload: SessionPayload = {
    ...user,
    expiresAt: Date.now() + MAX_AGE_SECONDS * 1000
  };
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), initializationVector);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const authenticationTag = cipher.getAuthTag();
  return [
    SESSION_VERSION,
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

export function readSessionToken(token: string | undefined): User | null {
  if (!token) {
    return null;
  }

  try {
    const [version, encodedIv, encodedTag, encodedCiphertext] = token.split(".");
    if (
      version !== SESSION_VERSION ||
      !encodedIv ||
      !encodedTag ||
      !encodedCiphertext
    ) {
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
    const payload = JSON.parse(decrypted) as SessionPayload;
    if (
      !payload.id ||
      !payload.email ||
      !payload.name ||
      !["MANAGER", "EMPLOYEE"].includes(payload.role) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }

    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  return readSessionToken((await cookies()).get(COOKIE_NAME)?.value);
}

export async function setSessionCookie(user: User) {
  (await cookies()).set(COOKIE_NAME, signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    priority: "high"
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    priority: "high"
  });
}

function getAuthSecret(): string {
  const configuredSecret = process.env.AUTH_SECRET?.trim();
  if (configuredSecret) {
    return configuredSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  return "development-only-secret";
}

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(getAuthSecret()).digest();
}
