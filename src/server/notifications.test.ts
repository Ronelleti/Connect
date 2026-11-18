import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ query: vi.fn(async () => []) }));

// A fresh key pair, as "npx web-push generate-vapid-keys" produces.
const { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY } = webpush.generateVAPIDKeys();

async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return import("./notifications");
}

describe("push notification settings", () => {
  const saved = { ...process.env };
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it("accepts the subject as a bare email, with mailto:, or as an https URL", async () => {
    const { normalizeVapidSubject } = await loadWith({});
    expect(normalizeVapidSubject("you@example.com")).toBe("mailto:you@example.com");
    expect(normalizeVapidSubject(" mailto: you@example.com ")).toBe("mailto:you@example.com");
    expect(normalizeVapidSubject('"mailto:you@example.com"')).toBe("mailto:you@example.com");
    expect(normalizeVapidSubject("https://wecom.example")).toBe("https://wecom.example");
    expect(normalizeVapidSubject("not an address")).toBeNull();
    expect(normalizeVapidSubject(undefined)).toBe("mailto:admin@wecomconnect.local");
  });

  it("is ready with a valid key pair even when the subject is a bare email", async () => {
    const { getPushConfig } = await loadWith({
      VAPID_PUBLIC_KEY: ` ${PUBLIC_KEY} `,
      VAPID_PRIVATE_KEY: PRIVATE_KEY,
      VAPID_SUBJECT: "you@example.com"
    });
    expect(getPushConfig()).toEqual({ ok: true, publicKey: PUBLIC_KEY });
  });

  it("explains a missing key without throwing", async () => {
    const { getPushConfig, getVapidPublicKey } = await loadWith({
      VAPID_PUBLIC_KEY: PUBLIC_KEY,
      VAPID_PRIVATE_KEY: undefined
    });
    expect(getPushConfig()).toMatchObject({ ok: false, reason: "missing" });
    expect(getVapidPublicKey()).toBeNull();
  });

  it("reports swapped keys as invalid instead of crashing, without revealing them", async () => {
    const { getPushConfig } = await loadWith({
      VAPID_PUBLIC_KEY: PRIVATE_KEY,
      VAPID_PRIVATE_KEY: PUBLIC_KEY,
      VAPID_SUBJECT: "mailto:you@example.com"
    });
    const config = getPushConfig();
    expect(config).toMatchObject({ ok: false, reason: "invalid" });
    expect(JSON.stringify(config)).not.toContain(PRIVATE_KEY);
    expect(JSON.stringify(config)).not.toContain(PUBLIC_KEY);
  });

  it("still records in-app notifications when the push settings are broken", async () => {
    const { notifyUsers } = await loadWith({
      VAPID_PUBLIC_KEY: "garbage",
      VAPID_PRIVATE_KEY: "garbage",
      VAPID_SUBJECT: "mailto:you@example.com"
    });
    await expect(
      notifyUsers(["00000000-0000-4000-8000-000000000000"], { title: "t", body: "b" })
    ).resolves.toBeUndefined();
  });
});
