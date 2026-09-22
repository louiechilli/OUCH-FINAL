import { pool } from "../db";
import { logActivity } from "../activity/log";
import { notifyClientPortalActivity } from "../notifications/service";
import { sendArtistReplySms, sendPortalAckSms } from "../portal/sms";

export interface BookingMessageRow {
  id: number;
  booking_id: number;
  sender_role: "artist" | "client";
  sender_name: string | null;
  body: string | null;
  media_url: string | null;
  created_at: Date;
}

export async function listBookingMessages(bookingId: number) {
  const { rows } = await pool.query<BookingMessageRow>(
    `SELECT m.id, m.booking_id, m.sender_role, m.body, m.media_url, m.created_at,
            u.name AS sender_name
     FROM booking_messages m
     LEFT JOIN users u ON u.id = m.sender_user_id
     WHERE m.booking_id = $1
     ORDER BY m.created_at ASC`,
    [bookingId]
  );
  return rows;
}

function messagePreview(body: string | null, mediaUrl: string | null): string {
  if (body?.trim()) return body.trim();
  if (mediaUrl) return "Sent a photo";
  return "New message";
}

export async function createBookingMessage(input: {
  bookingId: number;
  senderRole: "artist" | "client";
  senderUserId?: number | null;
  body?: string | null;
  mediaUrl?: string | null;
  actorUserId?: number;
}) {
  const text = input.body?.trim() || null;
  if (!text && !input.mediaUrl) {
    throw new Error("A message needs text or an attached photo");
  }

  const { rows: bookingRows } = await pool.query("SELECT id FROM bookings WHERE id = $1", [
    input.bookingId,
  ]);
  if (!bookingRows[0]) {
    throw new Error("Booking not found");
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO booking_messages (booking_id, sender_user_id, sender_role, body, media_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      input.bookingId,
      input.senderRole === "artist" ? (input.senderUserId ?? null) : null,
      input.senderRole,
      text,
      input.mediaUrl ?? null,
    ]
  );

  const messageId = rows[0].id;
  const preview = messagePreview(text, input.mediaUrl ?? null);

  if (input.senderRole === "artist" && input.actorUserId) {
    await logActivity({
      entityType: "booking_message",
      entityId: messageId,
      eventType: "sent",
      actorUserId: input.actorUserId,
      description: `Message sent on booking #${input.bookingId}`,
      metadata: { bookingId: input.bookingId },
    });

    void sendArtistReplySms(input.bookingId, preview).catch((err) =>
      console.error(`Failed to SMS client about artist reply on booking #${input.bookingId}`, err)
    );
  }

  if (input.senderRole === "client") {
    await logActivity({
      entityType: "booking_message",
      entityId: messageId,
      eventType: "client_sent",
      actorLabel: "client_portal",
      description: `Client message on booking #${input.bookingId}`,
      metadata: { bookingId: input.bookingId, hasMedia: Boolean(input.mediaUrl) },
    });

    void notifyClientPortalActivity(input.bookingId, preview, Boolean(input.mediaUrl)).catch((err) =>
      console.error(`Failed to notify artist about client message on booking #${input.bookingId}`, err)
    );

    const ack = input.mediaUrl
      ? "Thanks — your photo was sent to your artist."
      : "Your message was sent to your artist.";
    void sendPortalAckSms(input.bookingId, ack).catch((err) =>
      console.error(`Failed to send portal ack SMS for booking #${input.bookingId}`, err)
    );
  }

  const messages = await listBookingMessages(input.bookingId);
  const message = messages.find((m) => m.id === messageId);
  if (!message) throw new Error("Could not load created message");
  return message;
}
