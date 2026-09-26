import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  publishWeek: vi.fn()
}));

vi.mock("@/server/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireApiUser: mocks.requireApiUser,
    isApiError: (value: unknown) => value instanceof NextResponse,
    jsonError: (message: string, status = 400, details?: unknown) =>
      NextResponse.json({ error: message, details }, { status })
  };
});
vi.mock("@/server/schedulePublishing", () => ({ publishWeek: mocks.publishWeek }));

import { NextResponse } from "next/server";
import { POST } from "./route";

const manager = { id: "manager", email: "manager@example.com", name: "Manager", role: "MANAGER" };

function publishRequest(weekStart: unknown) {
  return new Request("http://localhost/api/schedule/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weekStart })
  });
}

describe("POST /api/schedule/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue(manager);
    mocks.publishWeek.mockResolvedValue({ publishedAt: "2026-09-26T10:00:00.000Z", wasPublished: false, notified: 3 });
  });

  it("publishes the week as the signed-in manager", async () => {
    const response = await POST(publishRequest("2026-10-04"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ notified: 3, wasPublished: false });
    expect(mocks.requireApiUser).toHaveBeenCalledWith(["MANAGER"]);
    expect(mocks.publishWeek).toHaveBeenCalledWith("2026-10-04", "manager");
  });

  it("rejects a date that isn't a week start", async () => {
    for (const weekStart of ["2026-10-05", "not-a-date", undefined]) {
      const response = await POST(publishRequest(weekStart));
      expect(response.status).toBe(400);
    }
    expect(mocks.publishWeek).not.toHaveBeenCalled();
  });

  it("refuses employees", async () => {
    mocks.requireApiUser.mockResolvedValue(NextResponse.json({ error: "Forbidden." }, { status: 403 }));
    const response = await POST(publishRequest("2026-10-04"));
    expect(response.status).toBe(403);
    expect(mocks.publishWeek).not.toHaveBeenCalled();
  });
});
