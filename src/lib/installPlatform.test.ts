import { describe, expect, it } from "vitest";
import { detectInstallPlatform } from "./installPlatform";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const SAMSUNG_INTERNET =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const SAMSUNG_CHROME =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const ANDROID_FACEBOOK =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

describe("detectInstallPlatform", () => {
  it("recognizes iPhone browsers", () => {
    expect(detectInstallPlatform(IPHONE_SAFARI, "iPhone", 5)).toBe("ios-safari");
    expect(detectInstallPlatform(IPHONE_CHROME, "iPhone", 5)).toBe("ios-other-browser");
  });

  it("treats a touch-screen Mac as an iPad", () => {
    expect(detectInstallPlatform(IPAD_DESKTOP_MODE, "MacIntel", 5)).toBe("ios-safari");
    expect(detectInstallPlatform(IPAD_DESKTOP_MODE, "MacIntel", 0)).toBe("desktop");
  });

  it("separates Samsung Internet from Chrome on a Samsung phone", () => {
    expect(detectInstallPlatform(SAMSUNG_INTERNET, "Linux armv8l", 5)).toBe("samsung-internet");
    expect(detectInstallPlatform(SAMSUNG_CHROME, "Linux armv8l", 5)).toBe("android");
  });

  it("flags built-in browsers of social apps", () => {
    expect(detectInstallPlatform(IPHONE_INSTAGRAM, "iPhone", 5)).toBe("in-app-browser");
    expect(detectInstallPlatform(ANDROID_FACEBOOK, "Linux armv8l", 5)).toBe("in-app-browser");
  });

  it("falls back to desktop", () => {
    expect(detectInstallPlatform(WINDOWS_CHROME, "Win32", 0)).toBe("desktop");
  });
});
