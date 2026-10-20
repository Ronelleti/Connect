"use client";

import { useSyncExternalStore } from "react";
import { detectInstallPlatform, type InstallPlatform } from "@/lib/installPlatform";

// Chrome and Samsung Internet on Android fire this event when they can show their own
// "install app" window. It isn't in the TypeScript DOM types yet.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    // Captured by the inline script in the root layout, in case the event fires
    // before this module loads.
    __wecomInstallPrompt?: BeforeInstallPromptEvent;
  }
}

export interface InstallState {
  platform: InstallPlatform;
  /** Running from the home-screen icon, or installed during this visit. */
  installed: boolean;
  /** The browser can show its own install window (Android). */
  canPrompt: boolean;
  /** The install banner was closed recently. */
  bannerDismissed: boolean;
}

const CHANGE_EVENT = "wecomconnect-install-change";
const DISMISS_KEY = "wecomconnect-install-dismissed";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedThisVisit = false;
let snapshot: InstallState | null = null;

function notify() {
  snapshot = null;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

if (typeof window !== "undefined") {
  deferredPrompt = window.__wecomInstallPrompt ?? null;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's own mini-bar hidden; the install banner and button offer it instead.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installedThisVisit = true;
    notify();
  });
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isBannerDismissed() {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
    return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_MS;
  } catch {
    return false;
  }
}

function subscribe(onStoreChange: () => void) {
  const standalone = window.matchMedia("(display-mode: standalone)");
  const onDisplayModeChange = () => notify();
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  standalone.addEventListener("change", onDisplayModeChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    standalone.removeEventListener("change", onDisplayModeChange);
  };
}

function getSnapshot(): InstallState {
  snapshot ??= {
    platform: detectInstallPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    installed: installedThisVisit || isStandalone(),
    canPrompt: deferredPrompt !== null,
    bannerDismissed: isBannerDismissed()
  };
  return snapshot;
}

function getServerSnapshot() {
  return null;
}

/** Install state in the browser; null while rendering on the server. */
export function useInstallApp() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Shows the browser's own install window. Resolves false when it isn't available. */
export async function promptInstall() {
  const event = deferredPrompt;
  if (!event) {
    return false;
  }
  // The same event can only be shown once; the browser fires a new one if it's dismissed.
  deferredPrompt = null;
  window.__wecomInstallPrompt = undefined;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

export function dismissInstallBanner() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private mode: the banner simply comes back next visit.
  }
  notify();
}

/** Whether to offer installing at all on this device. */
export function shouldOfferInstall(state: InstallState | null): state is InstallState {
  return state !== null && !state.installed && (state.platform !== "desktop" || state.canPrompt);
}
