"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InstallAppBanner } from "./InstallApp";
import { ThemeToggle } from "./ThemeToggle";

export function AuthForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setIsSubmitting(false);

    if (!response.ok) {
      // A server crash can return an empty body; show a generic error instead of throwing.
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "הפעולה נכשלה.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <div className="auth-theme-toggle"><ThemeToggle /></div>
      <section className="auth-panel">
        <div className="brand-lockup">
          <Image src="/wecom-logo.svg" alt="wecom" width={132} height={60} priority />
          <span>connect</span>
        </div>
        <h1>כניסה למערכת</h1>
        {/* method="post" so that if scripts fail to load, the browser never puts the password in the URL. */}
        <form method="post" onSubmit={handleSubmit} className="auth-form">
          <label>
            אימייל או שם משתמש
            <input
              name="email"
              type="text"
              required
              autoComplete="username"
            />
          </label>
          <label>
            סיסמה
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "מתחבר..." : "כניסה"}
          </button>
        </form>
      </section>
      <InstallAppBanner />
    </main>
  );
}
