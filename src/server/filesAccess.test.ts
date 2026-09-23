import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFilesAccessToken, signFilesAccessToken, verifyFilesAccessCode } from "./filesAccess";

const originalAuthSecret = process.env.AUTH_SECRET;
const originalAccessCode = process.env.FILES_ACCESS_CODE;

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

afterEach(() => {
  vi.useRealTimers();
  if (originalAccessCode === undefined) {
    delete process.env.FILES_ACCESS_CODE;
  } else {
    process.env.FILES_ACCESS_CODE = originalAccessCode;
  }
});

describe("verifyFilesAccessCode", () => {
  it("accepts the exact configured code", () => {
    process.env.FILES_ACCESS_CODE = "239812";
    expect(verifyFilesAccessCode("239812")).toBe(true);
  });

  it("rejects a wrong code", () => {
    process.env.FILES_ACCESS_CODE = "239812";
    expect(verifyFilesAccessCode("000000")).toBe(false);
  });

  it("trims surrounding whitespace from the submitted code", () => {
    process.env.FILES_ACCESS_CODE = "239812";
    expect(verifyFilesAccessCode("  239812  ")).toBe(true);
  });

  it("fails closed when no code is configured", () => {
    delete process.env.FILES_ACCESS_CODE;
    expect(verifyFilesAccessCode("")).toBe(false);
    expect(verifyFilesAccessCode("anything")).toBe(false);
  });
});

describe("files access token", () => {
  it("round-trips as valid immediately after signing", () => {
    const token = signFilesAccessToken();
    expect(readFilesAccessToken(token)).toBe(true);
  });

  it("rejects a tampered token", () => {
    const parts = signFilesAccessToken().split(".");
    // Always change the first character (every bit of it is significant); replacing it
    // with a fixed letter would be a no-op whenever the signature already starts with it.
    parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
    expect(readFilesAccessToken(parts.join("."))).toBe(false);
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = signFilesAccessToken();

    vi.setSystemTime(new Date("2026-02-15T00:00:00.000Z")); // more than 30 days later
    expect(readFilesAccessToken(token)).toBe(false);
  });

  it("rejects malformed tokens", () => {
    expect(readFilesAccessToken(undefined)).toBe(false);
    expect(readFilesAccessToken("")).toBe(false);
    expect(readFilesAccessToken("not-a-real-token")).toBe(false);
  });
});
