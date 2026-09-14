import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readSwapApprovalToken, signSwapApprovalToken } from "./swapApprovalToken";

const originalAuthSecret = process.env.AUTH_SECRET;

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
});

describe("swap approval email tokens", () => {
  it("round-trips the swap id, action, and summary without exposing them in plain text", () => {
    const token = signSwapApprovalToken("swap-1", "approve_manager", "נועה כהן מבקשת להחליף");

    expect(token.split(".")).toHaveLength(4);
    expect(token).not.toContain("swap-1");
    expect(readSwapApprovalToken(token)).toMatchObject({
      swapId: "swap-1",
      action: "approve_manager",
      summary: "נועה כהן מבקשת להחליף"
    });
  });

  it("rejects a modified authentication tag", () => {
    const parts = signSwapApprovalToken("swap-1", "decline_manager", "summary").split(".");
    // Tamper the first character of the tag, which always flips the decoded byte
    // (unlike the last character of a base64 segment, whose low bits can be unused).
    parts[2] = `x${parts[2].slice(1)}`;

    expect(readSwapApprovalToken(parts.join("."))).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSwapApprovalToken("swap-1", "approve_manager", "summary");
    process.env.AUTH_SECRET = "a-completely-different-secret-value";

    expect(readSwapApprovalToken(token)).toBeNull();

    process.env.AUTH_SECRET = "test-secret-that-is-long-and-not-used-in-production";
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = signSwapApprovalToken("swap-1", "approve_manager", "summary");

    vi.setSystemTime(new Date("2026-01-09T00:00:00.000Z")); // 8 days later
    expect(readSwapApprovalToken(token)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(readSwapApprovalToken(null)).toBeNull();
    expect(readSwapApprovalToken("")).toBeNull();
    expect(readSwapApprovalToken("not-a-real-token")).toBeNull();
    expect(readSwapApprovalToken("v1.a.b.c")).toBeNull();
  });
});
