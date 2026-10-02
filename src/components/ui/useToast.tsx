"use client";

import { useCallback, useEffect, useState } from "react";

export function useToast() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);
  const toast = message ? (
    <button type="button" className="toast" role="status" onClick={() => setMessage("")}>
      {message}
    </button>
  ) : null;
  return { show: useCallback((text: string) => setMessage(text), []), toast };
}
