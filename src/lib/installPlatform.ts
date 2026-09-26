// Works out which "add to home screen" instructions fit the visitor's phone and browser.
export type InstallPlatform =
  | "ios-safari"
  | "ios-other-browser"
  | "in-app-browser"
  | "samsung-internet"
  | "android"
  | "desktop";

export function detectInstallPlatform(userAgent: string, platform = "", maxTouchPoints = 0): InstallPlatform {
  // iPadOS 13+ reports itself as a Mac, so a touch-screen "Mac" is an iPad.
  const isIos = /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isAndroid = /Android/.test(userAgent);

  // Links opened from Facebook, Instagram, etc. load in a built-in browser that can't install apps.
  if ((isIos || isAndroid) && /FBAN|FBAV|FB_IAB|Instagram|Line\/|LinkedInApp|Snapchat|TikTok/.test(userAgent)) {
    return "in-app-browser";
  }
  if (isIos) {
    return /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/.test(userAgent) ? "ios-other-browser" : "ios-safari";
  }
  if (isAndroid) {
    return /SamsungBrowser/.test(userAgent) ? "samsung-internet" : "android";
  }
  return "desktop";
}
