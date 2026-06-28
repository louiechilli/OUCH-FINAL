import { pool } from "../db";
import { getCalendarProvider } from "../calendar";
import { metadataFor } from "../calendar/sync";

interface BookingForCalendar {
  id: number;
  starts_at: string;
  ends_at: string;
  client_notes: string | null;
  google_calendar_event_id: string | null;
  google_calendar_id: string | null;
  client_first_name: string;
  client_last_name: string;
  service_name: string;
}

async function loadBookingForCalendar(bookingId: number): Promise<BookingForCalendar | null> {
  const { rows } = await pool.query<BookingForCalendar>(
    `SELECT b.id, b.starts_at, b.ends_at, b.client_notes, b.google_calendar_event_id,
            a.google_calendar_id,
            c.first_name AS client_first_name, c.last_name AS client_last_name,
            s.name AS service_name
     FROM bookings b
     JOIN artists a ON a.id = b.artist_id
     JOIN clients c ON c.id = b.client_id
     JOIN services s ON s.id = b.service_id
     WHERE b.id = $1`,
    [bookingId]
  );
  return rows[0] ?? null;
}

/** Creates or updates the Google Calendar event for a booking. No-ops
 * silently if the artist has no calendar configured — a missing/misconfigured
 * calendar should never block taking a booking. */
export async function syncBookingToCalendar(bookingId: number): Promise<void> {
  const booking = await loadBookingForCalendar(bookingId);
  if (!booking?.google_calendar_id) return;

  const provider = getCalendarProvider();
  const input = {
    summary: `${booking.client_first_name} ${booking.client_last_name} — ${booking.service_name}`,
    description: booking.client_notes ?? undefined,
    startsAt: new Date(booking.starts_at),
    endsAt: new Date(booking.ends_at),
    metadata: metadataFor("booking", booking.id),
  };

  if (booking.google_calendar_event_id) {
    await provider.updateEvent(booking.google_calendar_id, booking.google_calendar_event_id, input);
    return;
  }

  const event = await provider.createEvent(booking.google_calendar_id, input);
  await pool.query("UPDATE bookings SET google_calendar_event_id = $1 WHERE id = $2", [
    event.id,
    bookingId,
  ]);
}

export async function removeBookingFromCalendar(bookingId: number): Promise<void> {
  const booking = await loadBookingForCalendar(bookingId);
  if (!booking?.google_calendar_id || !booking.google_calendar_event_id) return;

  const provider = getCalendarProvider();
  await provider.deleteEvent(booking.google_calendar_id, booking.google_calendar_event_id);
}
