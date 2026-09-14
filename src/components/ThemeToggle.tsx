"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, () => "light");

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("wecomconnect-theme", nextTheme);
    window.dispatchEvent(new Event("wecomconnect-theme-change"));
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      title={isDark ? "מצב בהיר" : "מצב כהה"}
      aria-label={isDark ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
      onClick={toggleTheme}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener("wecomconnect-theme-change", onStoreChange);
  return () => window.removeEventListener("wecomconnect-theme-change", onStoreChange);
}

function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
