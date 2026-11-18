import webpush from "web-push";
import { query } from "./db";

export interface NotificationMessage {
  title: string;
  body: string;
  // In-app path to open when the notification is clicked, e.g. "/requests".
  link?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | Date | null;
  created_at: string | Date;
}

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushConfig =
  | { ok: true; publicKey: string }
  | { ok: false; reason: "missing" | "invalid"; problem: string };

let cachedPushConfig: PushConfig | null = null;

// Accepts "you@example.com", "mailto: you@example.com" or an https URL, and returns the
// "mailto:you@example.com" / URL form the push services require, or null if it's unusable.
export function normalizeVapidSubject(raw: string | undefined): string | null {
  const value = (raw ?? "").trim().replace(/^["']|["']$/g, "").trim();
  if (!value) {
    return "mailto:admin@wecomconnect.local";
  }
  if (/^https:\/\/\S+$/i.test(value)) {
    return value;
  }
  const email = value.replace(/^mailto:\s*/i, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : null;
}

function cleanKey(raw: string | undefined) {
  return (raw ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

// Checks the VAPID settings once and remembers the result. Problems are described without
// ever including a key's value.
export function getPushConfig(): PushConfig {
  if (cachedPushConfig) {
    return cachedPushConfig;
  }
  const publicKey = cleanKey(process.env.VAPID_PUBLIC_KEY);
  const privateKey = cleanKey(process.env.VAPID_PRIVATE_KEY);
  const subject = normalizeVapidSubject(process.env.VAPID_SUBJECT);

  if (!publicKey || !privateKey) {
    cachedPushConfig = {
      ok: false,
      reason: "missing",
      problem: !publicKey && !privateKey
        ? "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set on the server."
        : `${!publicKey ? "VAPID_PUBLIC_KEY" : "VAPID_PRIVATE_KEY"} is not set on the server.`
    };
  } else if (!subject) {
    cachedPushConfig = {
      ok: false,
      reason: "invalid",
      problem: "VAPID_SUBJECT must be an email address (mailto:you@example.com) or an https:// URL."
    };
  } else {
    try {
      // Throws if a key has the wrong format or length (e.g. the two keys were swapped).
      webpush.setVapidDetails(subject, publicKey, privateKey);
      cachedPushConfig = { ok: true, publicKey };
    } catch (error) {
      cachedPushConfig = {
        ok: false,
        reason: "invalid",
        problem: `The VAPID keys are not valid (${(error as Error).message}). Generate a new pair with "npx web-push generate-vapid-keys" and check the public and private keys aren't swapped.`
      };
    }
  }
  if (!cachedPushConfig.ok) {
    console.error("Push notifications are disabled:", cachedPushConfig.problem);
  }
  return cachedPushConfig;
}

export function getVapidPublicKey(): string | null {
  const config = getPushConfig();
  return config.ok ? config.publicKey : null;
}

export interface PushDeliveryResult {
  sent: number;
  failed: { statusCode: number | null; message: string }[];
  removed: number;
}

// Sends one payload to every device of the given users. Never throws.
async function pushToUsers(userIds: string[], message: NotificationMessage): Promise<PushDeliveryResult> {
  const result: PushDeliveryResult = { sent: 0, failed: [], removed: 0 };
  if (!getPushConfig().ok) {
    return result;
  }
  try {
    const subscriptions = await query<PushSubscriptionRow>(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])",
      [userIds]
    );
    const payload = JSON.stringify(message);
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth }
            },
            payload,
            { TTL: 24 * 60 * 60, urgency: "high" }
          );
          result.sent += 1;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode ?? null;
          const body = String((error as { body?: string }).body ?? (error as Error).message ?? "");
          if (statusCode === 404 || statusCode === 410) {
            // The browser dropped this subscription (app removed, permission revoked).
            await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [subscription.endpoint]);
            result.removed += 1;
          } else {
            console.error("Failed to send push notification", statusCode, body);
            result.failed.push({ statusCode, message: body.slice(0, 200) });
          }
        }
      })
    );
  } catch (error) {
    console.error("Failed to deliver push notifications", error);
    result.failed.push({ statusCode: null, message: (error as Error).message });
  }
  return result;
}

// Sends a test notification to the caller's own devices and reports what happened.
export async function sendTestPush(userId: string) {
  return pushToUsers([userId], {
    title: "התראת בדיקה",
    body: "אם רואים את ההודעה הזו, ההתראות בטלפון עובדות.",
    link: "/"
  });
}

export async function countPushSubscriptions(userId: string) {
  const [row] = await query<{ count: number }>(
    "SELECT count(*)::int AS count FROM push_subscriptions WHERE user_id = $1",
    [userId]
  );
  return row?.count ?? 0;
}

// Saves the notification for each user's in-app bell and pushes it to every device they
// enabled phone notifications on. Delivery problems are logged, never thrown: a failed
// push must not undo the action (a swap approval, a vacation request...) that caused it.
export async function notifyUsers(userIds: (string | null | undefined)[], message: NotificationMessage) {
  const recipients = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (recipients.length === 0) {
    return;
  }

  try {
    await query(
      `INSERT INTO notifications (user_id, title, body, link)
       SELECT user_id, $2, $3, $4 FROM unnest($1::uuid[]) AS user_id`,
      [recipients, message.title, message.body, message.link ?? null]
    );
  } catch (error) {
    console.error("Failed to save notifications", error);
    return;
  }

  await pushToUsers(recipients, message);
}

export async function listManagerUserIds(): Promise<string[]> {
  const rows = await query<{ id: string }>("SELECT id FROM users WHERE role = 'MANAGER'");
  return rows.map((row) => row.id);
}

export async function findUserIdForEmployee(employeeId: string | null | undefined) {
  if (!employeeId) {
    return null;
  }
  const [row] = await query<{ user_id: string | null }>(
    "SELECT user_id FROM employees WHERE id = $1",
    [employeeId]
  );
  return row?.user_id ?? null;
}

export async function listNotifications(userId: string, limit = 30) {
  const [rows, [unread]] = await Promise.all([
    query<NotificationRow>(
      `SELECT id, title, body, link, read_at, created_at FROM notifications
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    ),
    query<{ count: number }>(
      "SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
      [userId]
    )
  ]);
  return {
    notifications: rows.map(toNotification),
    unreadCount: unread?.count ?? 0
  };
}

export async function markNotificationsRead(userId: string, notificationId?: string) {
  if (notificationId) {
    await query(
      "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = $2 AND read_at IS NULL",
      [userId, notificationId]
    );
    return;
  }
  await query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [
    userId
  ]);
}

export async function savePushSubscription(userId: string, subscription: PushSubscriptionInput) {
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
  );
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  await query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [
    userId,
    endpoint
  ]);
}

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString()
  };
}
