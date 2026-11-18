"use client";

import { Bell, BellRing, CheckCheck, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface AppNotification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

type PushState =
  | "unsupported"
  | "ios-needs-install"
  | "not-configured"
  | "off"
  | "on"
  | "denied"
  | "error";

// The device's push state plus, for "not-configured" and "error", what went wrong.
interface PushStatus {
  state: PushState;
  message?: string;
}

const POLL_INTERVAL_MS = 60_000;

const timeFormat = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

export function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushStatus, setPushStatus] = useState<PushStatus>({ state: "unsupported" });
  const [pushBusy, setPushBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      return;
    }
    const body = await response.json();
    setNotifications(body.notifications ?? []);
    setUnreadCount(body.unreadCount ?? 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (!cancelled && document.visibilityState === "visible") {
        await refresh();
      }
    }
    void poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    async function detectPushState() {
      const status = await getPushState().catch(
        (error: Error): PushStatus => ({ state: "error", message: error.message })
      );
      if (!cancelled) {
        setPushStatus(status);
      }
    }
    void detectPushState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function closeOnOutsideClick(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen]);

  async function openNotification(notification: AppNotification) {
    if (!notification.readAt) {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notification.id })
      });
      void refresh();
    }
    if (notification.link) {
      setIsOpen(false);
      router.push(notification.link);
    }
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    void refresh();
  }

  async function enablePush() {
    setPushBusy(true);
    setTestResult(null);
    try {
      setPushStatus(await subscribeToPush());
    } catch (error) {
      setPushStatus({ state: "error", message: (error as Error).message });
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTest() {
    setPushBusy(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      setTestResult(describeTestResult(response.ok, body));
    } catch (error) {
      setTestResult(`שליחת הבדיקה נכשלה: ${(error as Error).message}`);
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="notification-bell" ref={panelRef}>
      <button
        className="icon-button"
        onClick={() => setIsOpen((open) => !open)}
        title="התראות"
        aria-label={unreadCount > 0 ? `התראות, ${unreadCount} שלא נקראו` : "התראות"}
      >
        <Bell size={18} />
        {unreadCount > 0 ? <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>

      {isOpen ? (
        <div className="notification-panel" role="dialog" aria-label="התראות">
          <div className="notification-panel-header">
            <strong>התראות</strong>
            <div>
              {unreadCount > 0 ? (
                <button onClick={markAllRead} title="סימון הכל כנקרא">
                  <CheckCheck size={16} />
                </button>
              ) : null}
              <button onClick={() => setIsOpen(false)} title="סגירה">
                <X size={16} />
              </button>
            </div>
          </div>

          <PushPrompt
            status={pushStatus}
            busy={pushBusy}
            onEnable={enablePush}
            onTest={sendTest}
            testResult={testResult}
          />

          <div className="notification-list">
            {notifications.length === 0 ? (
              <p className="notification-empty">אין התראות עדיין.</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  className={`notification-item ${notification.readAt ? "" : "unread"}`}
                  onClick={() => openNotification(notification)}
                >
                  <strong>{notification.title}</strong>
                  {notification.body ? <span>{notification.body}</span> : null}
                  <small>{timeFormat.format(new Date(notification.createdAt))}</small>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PushPrompt({
  status,
  busy,
  onEnable,
  onTest,
  testResult
}: {
  status: PushStatus;
  busy: boolean;
  onEnable: () => void;
  onTest: () => void;
  testResult: string | null;
}) {
  const { state, message } = status;
  if (state === "off" || state === "error") {
    return (
      <>
        <button className="notification-push-button" onClick={onEnable} disabled={busy}>
          <BellRing size={16} />
          {busy ? "מפעיל..." : state === "error" ? "ניסיון חוזר להפעלת התראות" : "הפעלת התראות בטלפון / במחשב"}
        </button>
        {state === "error" ? (
          <p className="notification-push-hint">הפעלת ההתראות נכשלה: {message}</p>
        ) : null}
      </>
    );
  }
  if (state === "ios-needs-install") {
    return (
      <p className="notification-push-hint">
        כדי לקבל התראות באייפון: לחצו על כפתור השיתוף בספארי ← &quot;הוספה למסך הבית&quot;, ופתחו את
        האפליקציה משם.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="notification-push-hint">
        ההתראות חסומות במכשיר הזה. באייפון: הגדרות ← התראות ← Wecom. באנדרואיד: הגדרות האתר או
        האפליקציה ← התראות.
      </p>
    );
  }
  if (state === "on") {
    return (
      <>
        <p className="notification-push-hint">התראות בטלפון / במחשב פעילות במכשיר זה.</p>
        <button className="notification-push-button" onClick={onTest} disabled={busy}>
          <Send size={16} />
          {busy ? "שולח..." : "שליחת התראת בדיקה"}
        </button>
        {testResult ? <p className="notification-push-hint">{testResult}</p> : null}
      </>
    );
  }
  if (state === "not-configured") {
    return (
      <p className="notification-push-hint">
        התראות לטלפון לא פעילות בשרת. ההתראות יופיעו כאן בינתיים.
        {message ? <><br />פרטים למנהל המערכת: {message}</> : null}
      </p>
    );
  }
  return null;
}

function describeTestResult(
  ok: boolean,
  body: { error?: string; sent?: number; failed?: { statusCode: number | null; message: string }[]; removed?: number }
) {
  if (!ok) {
    return `שליחת הבדיקה נכשלה: ${body.error ?? "שגיאת שרת"}`;
  }
  const failed = body.failed ?? [];
  if (failed.length > 0) {
    const first = failed[0];
    return `שירות ההתראות דחה את השליחה (${first.statusCode ?? "ללא קוד"}): ${first.message}`;
  }
  if (!body.sent) {
    return "לא נמצא מכשיר רשום. סגרו ופתחו את האפליקציה ונסו שוב.";
  }
  return `נשלחה התראת בדיקה ל-${body.sent} מכשירים. אם היא לא הופיעה תוך דקה, בדקו שההתראות מותרות בהגדרות המכשיר.`;
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const PUSH_SETUP_TIMEOUT_MS = 20_000;

// The browser's push setup can hang forever (e.g. no connection to Apple's or Google's push
// service); give up with a clear message instead of leaving "מפעיל..." on screen.
function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), PUSH_SETUP_TIMEOUT_MS))
  ]);
}

function serviceWorkerReady() {
  return withTimeout(
    navigator.serviceWorker.ready,
    "רכיב ההתראות של האפליקציה לא נטען. סגרו ופתחו את האפליקציה ונסו שוב."
  );
}

async function fetchServerPush(): Promise<{ publicKey: string | null; problem: string | null }> {
  const response = await fetch("/api/push", { cache: "no-store" }).catch(() => null);
  const body = response?.ok ? await response.json() : {};
  return { publicKey: body.publicKey ?? null, problem: body.problem ?? null };
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON())
  });
  return response.ok;
}

// True when the subscription was made with this server key. One made with an earlier key
// (before the keys were set or after they changed) is rejected by the push services.
function usesKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options?.applicationServerKey;
  if (!current) {
    return true;
  }
  const expected = urlBase64ToUint8Array(publicKey);
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

async function getPushState(): Promise<PushStatus> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { state: isIos() && !isStandalone() ? "ios-needs-install" : "unsupported" };
  }
  const { publicKey, problem } = await fetchServerPush();
  if (!publicKey) {
    return { state: "not-configured", message: problem ?? undefined };
  }
  if (Notification.permission === "denied") {
    return { state: "denied" };
  }
  const registration = await serviceWorkerReady();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription || Notification.permission !== "granted") {
    return { state: "off" };
  }
  if (!usesKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    return { state: "off" };
  }
  // Re-register on every visit so the server always has this device, even if its record
  // was lost or the earlier save failed.
  return { state: (await saveSubscription(subscription)) ? "on" : "off" };
}

async function subscribeToPush(): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { state: permission === "denied" ? "denied" : "off" };
  }
  const { publicKey, problem } = await fetchServerPush();
  if (!publicKey) {
    return { state: "not-configured", message: problem ?? undefined };
  }
  const registration = await serviceWorkerReady();
  const existing = await registration.pushManager.getSubscription();
  if (existing && !usesKey(existing, publicKey)) {
    await existing.unsubscribe();
  }
  const subscription =
    existing && usesKey(existing, publicKey)
      ? existing
      : await withTimeout(
          registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          }),
          "אין חיבור לשירות ההתראות של הטלפון. בדקו את החיבור לאינטרנט ונסו שוב."
        );
  if (!(await saveSubscription(subscription))) {
    return { state: "error", message: "השרת לא שמר את המכשיר. נסו שוב." };
  }
  return { state: "on" };
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
