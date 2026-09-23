"use client";

import { Bell, BellRing, CheckCheck, X } from "lucide-react";
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

type PushState = "unsupported" | "ios-needs-install" | "not-configured" | "off" | "on" | "denied";

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
  const [pushState, setPushState] = useState<PushState>("unsupported");
  const [pushBusy, setPushBusy] = useState(false);
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
      const state = await getPushState();
      if (!cancelled) {
        setPushState(state);
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
    try {
      setPushState(await subscribeToPush());
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

          <PushPrompt state={pushState} busy={pushBusy} onEnable={enablePush} />

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
  state,
  busy,
  onEnable
}: {
  state: PushState;
  busy: boolean;
  onEnable: () => void;
}) {
  if (state === "off") {
    return (
      <button className="notification-push-button" onClick={onEnable} disabled={busy}>
        <BellRing size={16} />
        {busy ? "מפעיל..." : "הפעלת התראות בטלפון / במחשב"}
      </button>
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
      <p className="notification-push-hint">ההתראות חסומות בדפדפן. אפשר לאפשר אותן בהגדרות האתר.</p>
    );
  }
  return null;
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

async function getPushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  }
  const response = await fetch("/api/push", { cache: "no-store" }).catch(() => null);
  const { publicKey } = response?.ok ? await response.json() : { publicKey: null };
  if (!publicKey) {
    return "not-configured";
  }
  if (Notification.permission === "denied") {
    return "denied";
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

async function subscribeToPush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission === "denied" ? "denied" : "off";
  }
  const response = await fetch("/api/push", { cache: "no-store" });
  const { publicKey } = await response.json();
  if (!publicKey) {
    return "not-configured";
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    }));
  const saved = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON())
  });
  return saved.ok ? "on" : "off";
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
