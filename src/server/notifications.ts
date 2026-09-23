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

let vapidConfigured: boolean | null = null;

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function isPushConfigured(): boolean {
  if (vapidConfigured !== null) {
    return vapidConfigured;
  }
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    vapidConfigured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@wecomconnect.local",
    publicKey,
    privateKey
  );
  vapidConfigured = true;
  return true;
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

  if (!isPushConfigured()) {
    return;
  }

  try {
    const subscriptions = await query<PushSubscriptionRow>(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])",
      [recipients]
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
            payload
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // The browser dropped this subscription (app removed, permission revoked).
            await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [subscription.endpoint]);
          } else {
            console.error("Failed to send push notification", error);
          }
        }
      })
    );
  } catch (error) {
    console.error("Failed to deliver push notifications", error);
  }
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
