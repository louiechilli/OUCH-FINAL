import webpush from "web-push";
import { pool } from "../db";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails("mailto:admin@ouchtattoostudio.com", vapidPublicKey, vapidPrivateKey);
}

export function isPushConfigured(): boolean {
  return Boolean(vapidPublicKey && vapidPrivateKey);
}

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  link?: string | null;
}

interface StoredSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function toWebPushSubscription(row: StoredSubscription): webpush.PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

export async function savePushSubscription(
  userId: number,
  subscription: webpush.PushSubscription,
  userAgent?: string | null
) {
  const keys = subscription.keys;
  if (!subscription.endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error("Invalid push subscription");
  }

  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent`,
    [userId, subscription.endpoint, keys.p256dh, keys.auth, userAgent ?? null]
  );
}

async function removePushSubscription(id: number) {
  await pool.query("DELETE FROM push_subscriptions WHERE id = $1", [id]);
}

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<number> {
  if (!isPushConfigured()) return 0;

  const { rows } = await pool.query<StoredSubscription>(
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
    [userId]
  );
  if (rows.length === 0) return 0;

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    link: payload.link ?? null,
  });

  let sent = 0;
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(toWebPushSubscription(row), message);
        sent += 1;
        await pool.query("UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1", [row.id]);
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(row.id);
        } else {
          console.error(`Push failed for subscription ${row.id}`, err);
        }
      }
    })
  );

  return sent;
}

export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<number> {
  const uniqueIds = [...new Set(userIds.filter((id) => Number.isFinite(id)))];
  if (uniqueIds.length === 0) return 0;

  const results = await Promise.all(uniqueIds.map((userId) => sendPushToUser(userId, payload)));
  return results.reduce((sum, count) => sum + count, 0);
}
