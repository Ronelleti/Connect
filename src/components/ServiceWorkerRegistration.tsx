"use client";

import { useEffect } from "react";
// Loaded here, on every page, so the Android install window is captured whichever page fires it.
import "@/hooks/useInstallApp";

// Registers the service worker that makes the site installable as an app and receives
// push notifications.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed", error);
      });
    }
  }, []);
  return null;
}
