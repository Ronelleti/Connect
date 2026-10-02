import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getEncryptionKey } from "./secretKey";

const COOKIE_NAME = "wecomconnect_session";
const SESSION_VERSION = "v2";
const MAX_AGE_SECONDS = 60 * 60 * 8;

// The cookie only identifies the person; their role, team and permissions are read from
// the database on every request, so changes apply immediately.
interface SessionPayload {
  id: string;
  expiresAt: number;
}

export interface SessionIdentity {
  id: string;
}

export function signSession(user: SessionIdentity): string {
  const payload: SessionPayload = {
    id: user.id,
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

export function readSessionToken(token: string | undefined): SessionIdentity | null {
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
    if (typeof payload.id !== "string" || !payload.id || !Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) {
      return null;
    }

    return { id: payload.id };
  } catch {
    return null;
  }
}

export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  return readSessionToken((await cookies()).get(COOKIE_NAME)?.value);
}

export async function setSessionCookie(user: SessionIdentity) {
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

