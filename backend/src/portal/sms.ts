import { pool } from "../db";
import { enqueueSmsToClient } from "../sms/service";
import { buildPortalUrl, createPortalToken } from "./tokens";

interface BookingSmsContext {
  bookingId: number;
  clientId: number;
  clientFirstName: string;
  serviceName: string;
  artistName: string;
  startsAt: Date;
}

async function loadBookingSmsContext(bookingId: number): Promise<BookingSmsContext | null> {
  const { rows } = await pool.query<{
    id: number;
    client_id: number;
    client_first_name: string;
    service_name: string;
    artist_display_name: string;
    starts_at: Date;
  }>(
    `SELECT b.id, b.client_id, b.starts_at,
            c.first_name AS client_first_name,
            s.name AS service_name,
            a.display_name AS artist_display_name
     FROM bookings b
     JOIN clients c ON c.id = b.client_id
     JOIN services s ON s.id = b.service_id
     JOIN artists a ON a.id = b.artist_id
     WHERE b.id = $1`,
    [bookingId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    bookingId: row.id,
    clientId: row.client_id,
    clientFirstName: row.client_first_name,
    serviceName: row.service_name,
    artistName: row.artist_display_name,
    startsAt: row.starts_at,
  };
}

function formatBookingWhen(startsAt: Date): string {
  return new Date(startsAt).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function portalLinkForBooking(bookingId: number, existingToken?: string): Promise<string> {
  const token = existingToken ?? (await createPortalToken(bookingId));
  return buildPortalUrl(token);
}

export async function sendBookingConfirmationSms(bookingId: number, portalToken: string) {
  const ctx = await loadBookingSmsContext(bookingId);
  if (!ctx) return;

  const when = formatBookingWhen(ctx.startsAt);
  const link = buildPortalUrl(portalToken);
  const name = ctx.clientFirstName || "there";

  await enqueueSmsToClient(
    ctx.clientId,
    `Hi ${name}, your ${ctx.serviceName} at Ouch Tattoo Studio is booked for ${when}. ` +
      `Chat with ${ctx.artistName} and share reference photos here: ${link}`
  );
}

export async function sendArtistReplySms(bookingId: number, preview: string) {
  const ctx = await loadBookingSmsContext(bookingId);
  if (!ctx) return;

  const link = await portalLinkForBooking(bookingId);
  const snippet = preview.length > 80 ? `${preview.slice(0, 77)}…` : preview;

  await enqueueSmsToClient(
    ctx.clientId,
    `${ctx.artistName} replied: "${snippet}" — view and reply: ${link}`
  );
}

export async function sendBookingConfirmedSms(bookingId: number) {
  const ctx = await loadBookingSmsContext(bookingId);
  if (!ctx) return;

  const link = await portalLinkForBooking(bookingId);
  const when = formatBookingWhen(ctx.startsAt);

  await enqueueSmsToClient(
    ctx.clientId,
    `Your ${ctx.serviceName} on ${when} is confirmed. Open your booking portal: ${link}`
  );
}

export async function sendPortalAckSms(bookingId: number, message: string) {
  const ctx = await loadBookingSmsContext(bookingId);
  if (!ctx) return;

  const link = await portalLinkForBooking(bookingId);
  await enqueueSmsToClient(ctx.clientId, `${message} ${link}`);
}
