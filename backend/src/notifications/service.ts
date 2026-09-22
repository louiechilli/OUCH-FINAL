import { pool } from "../db";
import { sendPushToUser } from "../push/service";

export interface NotificationRow {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  metadata: Record<string, unknown> | null;
  read_at: Date | null;
  created_at: Date;
}

export interface CreateNotificationInput {
  userId: number;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
}

function toNotificationResponse(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    metadata: row.metadata,
    readAt: row.read_at,
    createdAt: row.created_at,
    read: row.read_at !== null,
  };
}

export async function createNotification(input: CreateNotificationInput) {
  const { rows } = await pool.query<NotificationRow>(
    `INSERT INTO notifications (user_id, type, title, body, link, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, type, title, body, link, metadata, read_at, created_at`,
    [
      input.userId,
      input.type,
      input.title,
      input.body,
      input.link ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  );
  const notification = toNotificationResponse(rows[0]);

  void sendPushToUser(input.userId, {
    title: input.title,
    body: input.body,
    link: input.link ?? null,
  }).catch((err) => console.error(`Failed to push notification to user ${input.userId}`, err));

  return notification;
}

export async function notifyUsers(
  userIds: number[],
  notification: Omit<CreateNotificationInput, "userId">
) {
  const uniqueIds = [...new Set(userIds.filter((id) => Number.isFinite(id)))];
  if (uniqueIds.length === 0) return [];

  const created = await Promise.all(
    uniqueIds.map((userId) => createNotification({ ...notification, userId }))
  );
  return created;
}

export async function getArtistUserId(artistId: number): Promise<number | null> {
  const { rows } = await pool.query<{ user_id: number }>(
    "SELECT user_id FROM artists WHERE id = $1",
    [artistId]
  );
  return rows[0]?.user_id ?? null;
}

export async function getAdminUserIds(excludeUserId?: number): Promise<number[]> {
  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE is_admin = true"
  );
  return rows.map((row) => row.id).filter((id) => id !== excludeUserId);
}

export async function listNotifications(
  userId: number,
  options: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
) {
  const limit = Math.min(options.limit ?? 50, 100);
  const offset = options.offset ?? 0;
  const conditions = ["user_id = $1"];
  const params: unknown[] = [userId];

  if (options.unreadOnly) {
    conditions.push("read_at IS NULL");
  }

  params.push(limit, offset);

  const { rows } = await pool.query<NotificationRow>(
    `SELECT id, user_id, type, title, body, link, metadata, read_at, created_at
     FROM notifications
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows.map(toNotificationResponse);
}

export async function getUnreadCount(userId: number) {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [userId]
  );
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationRead(notificationId: number, userId: number) {
  const { rows } = await pool.query<NotificationRow>(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, type, title, body, link, metadata, read_at, created_at`,
    [notificationId, userId]
  );
  if (!rows[0]) return null;
  return toNotificationResponse(rows[0]);
}

export async function markAllNotificationsRead(userId: number) {
  await pool.query(
    "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
    [userId]
  );
}

export async function clearNotification(notificationId: number, userId: number) {
  const { rowCount } = await pool.query(
    "DELETE FROM notifications WHERE id = $1 AND user_id = $2",
    [notificationId, userId]
  );
  return (rowCount ?? 0) > 0;
}

export async function clearAllNotifications(userId: number) {
  await pool.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
}

export async function notifyBookingCreated(bookingId: number, actorUserId: number) {
  const { rows } = await pool.query<{
    artist_id: number;
    client_first_name: string;
    client_last_name: string;
    service_name: string;
    starts_at: Date;
  }>(
    `SELECT b.artist_id, c.first_name AS client_first_name, c.last_name AS client_last_name,
            s.name AS service_name, b.starts_at
     FROM bookings b
     JOIN clients c ON c.id = b.client_id
     JOIN services s ON s.id = b.service_id
     WHERE b.id = $1`,
    [bookingId]
  );
  const booking = rows[0];
  if (!booking) return;

  const clientName = `${booking.client_first_name} ${booking.client_last_name}`.trim();
  const when = new Date(booking.starts_at).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const artistUserId = await getArtistUserId(booking.artist_id);
  const adminIds = await getAdminUserIds(actorUserId);
  const recipientIds = [...adminIds];
  if (artistUserId && artistUserId !== actorUserId) {
    recipientIds.push(artistUserId);
  }

  await notifyUsers(recipientIds, {
    type: "booking_created",
    title: "New booking",
    body: `${clientName} — ${booking.service_name} on ${when}`,
    link: `/bookings/${bookingId}`,
    metadata: { bookingId },
  });
}

export async function notifyPaymentReceived(
  bookingId: number,
  amount: number,
  paymentMethod: string,
  paymentType: string,
  actorUserId: number
) {
  const { rows } = await pool.query<{ artist_id: number }>(
    "SELECT artist_id FROM bookings WHERE id = $1",
    [bookingId]
  );
  const booking = rows[0];
  if (!booking) return;

  const artistUserId = await getArtistUserId(booking.artist_id);
  if (!artistUserId || artistUserId === actorUserId) return;

  const label = paymentType === "deposit" ? "Deposit" : "Payment";

  await createNotification({
    userId: artistUserId,
    type: "payment_received",
    title: `${label} received`,
    body: `£${amount.toFixed(2)} ${paymentMethod} on booking #${bookingId}`,
    link: `/bookings/${bookingId}`,
    metadata: { bookingId, amount, paymentMethod, paymentType },
  });
}

export async function notifyBookingStatusChange(
  bookingId: number,
  status: string,
  actorUserId: number
) {
  const titles: Record<string, string> = {
    cancelled: "Booking cancelled",
    done: "Booking marked done",
    booked: "Booking updated",
  };
  if (!titles[status]) return;

  const { rows } = await pool.query<{
    artist_id: number;
    client_first_name: string;
    client_last_name: string;
    service_name: string;
  }>(
    `SELECT b.artist_id, c.first_name AS client_first_name, c.last_name AS client_last_name,
            s.name AS service_name
     FROM bookings b
     JOIN clients c ON c.id = b.client_id
     JOIN services s ON s.id = b.service_id
     WHERE b.id = $1`,
    [bookingId]
  );
  const booking = rows[0];
  if (!booking) return;

  const artistUserId = await getArtistUserId(booking.artist_id);
  if (!artistUserId || artistUserId === actorUserId) return;

  const clientName = `${booking.client_first_name} ${booking.client_last_name}`.trim();

  await createNotification({
    userId: artistUserId,
    type: status === "cancelled" ? "booking_cancelled" : status === "done" ? "booking_done" : "booking_updated",
    title: titles[status],
    body: `${clientName} — ${booking.service_name}`,
    link: `/bookings/${bookingId}`,
    metadata: { bookingId, status },
  });
}

export async function notifyBookingRescheduled(
  bookingId: number,
  actorUserId: number,
  newStartsAt: Date
) {
  const { rows } = await pool.query<{
    artist_id: number;
    client_first_name: string;
    client_last_name: string;
    service_name: string;
  }>(
    `SELECT b.artist_id, c.first_name AS client_first_name, c.last_name AS client_last_name,
            s.name AS service_name
     FROM bookings b
     JOIN clients c ON c.id = b.client_id
     JOIN services s ON s.id = b.service_id
     WHERE b.id = $1`,
    [bookingId]
  );
  const booking = rows[0];
  if (!booking) return;

  const artistUserId = await getArtistUserId(booking.artist_id);
  if (!artistUserId || artistUserId === actorUserId) return;

  const clientName = `${booking.client_first_name} ${booking.client_last_name}`.trim();
  const when = newStartsAt.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  await createNotification({
    userId: artistUserId,
    type: "booking_rescheduled",
    title: "Booking rescheduled",
    body: `${clientName} — ${booking.service_name} moved to ${when}`,
    link: `/bookings/${bookingId}`,
    metadata: { bookingId },
  });
}

export async function notifyClientPortalActivity(
  bookingId: number,
  preview: string,
  hasMedia: boolean
) {
  const { rows } = await pool.query<{
    artist_id: number;
    client_first_name: string;
    client_last_name: string;
  }>(
    `SELECT b.artist_id, c.first_name AS client_first_name, c.last_name AS client_last_name
     FROM bookings b
     JOIN clients c ON c.id = b.client_id
     WHERE b.id = $1`,
    [bookingId]
  );
  const booking = rows[0];
  if (!booking) return;

  const artistUserId = await getArtistUserId(booking.artist_id);
  if (!artistUserId) return;

  const clientName = `${booking.client_first_name} ${booking.client_last_name}`.trim();

  await createNotification({
    userId: artistUserId,
    type: hasMedia ? "client_media" : "client_message",
    title: hasMedia ? "Client uploaded a photo" : "New client message",
    body: `${clientName}: ${preview}`,
    link: `/bookings/${bookingId}`,
    metadata: { bookingId, hasMedia },
  });
}
