"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useUndoableAction<T>({
  durationMs,
  onExpire,
  onUndo
}: {
  durationMs: number;
  onExpire: (value: T) => void | Promise<void>;
  onUndo: (value: T) => void;
}) {
  const [pending, setPending] = useState<T | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(durationMs / 1000));
  const onExpireRef = useRef(onExpire);
  const onUndoRef = useRef(onUndo);

  // Keep callbacks current without restarting an active countdown when parent state changes.
  useEffect(() => {
    onExpireRef.current = onExpire;
    onUndoRef.current = onUndo;
  }, [onExpire, onUndo]);

  useEffect(() => {
    if (!pending) {
      return;
    }
    const expiresAt = Date.now() + durationMs;
    const interval = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    }, 200);
    const timeout = window.setTimeout(() => {
      setPending(null);
      void onExpireRef.current(pending);
    }, durationMs);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [durationMs, pending]);

  const stage = useCallback((value: T) => {
    setSecondsLeft(Math.ceil(durationMs / 1000));
    setPending((current) => current ?? value);
  }, [durationMs]);
  const undo = useCallback(() => {
    setPending((current) => {
      if (current) {
        onUndoRef.current(current);
      }
      return null;
    });
  }, []);

  return { pending, secondsLeft, stage, undo };
}
