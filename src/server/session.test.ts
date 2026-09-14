import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readSessionToken, signSession } from "./session";
import type { User } from "@/lib/types";

const originalAuthSecret = process.env.AUTH_SECRET;
const user: User = {
  id: "user-1",
  email: "employee@example.com",
  name: "עובד בדיקה",
  role: "EMPLOYEE"
};

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-that-is-long-and-not-used-in-production";
});

afterAll(() => {
  if (originalAuthSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = originalAuthSecret;
  }
});

describe("encrypted sessions", () => {
  it("round-trips an authenticated user without exposing its payload", () => {
    const token = signSession(user);

    expect(token.split(".")).toHaveLength(4);
    expect(token).not.toContain(user.email);
    expect(readSessionToken(token)).toEqual(user);
  });

  it("rejects a modified authentication tag", () => {
    const parts = signSession(user).split(".");
    parts[2] = `${parts[2].slice(0, -1)}x`;

    expect(readSessionToken(parts.join("."))).toBeNull();
  });
});
