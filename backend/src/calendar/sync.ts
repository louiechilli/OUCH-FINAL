import { pool } from "../db";
import { getCalendarProvider } from "./index";
import type { CalendarEvent } from "./CalendarProvider";

// Tags every event we create so a later webhook can recognise it as ours
// instead of mistaking our own write for an external change.
export function metadataFor(type: "booking" | "block", id: number): Record<string, string> {
  return { eposType: type, eposId: String(id) };
}

interface ArtistRow {
  id: number;
  google_calendar_id: string | null;
  is_active: boolean;
}

async function getArtist(artistId: number): Promise<ArtistRow | null> {
  const { rows } = await pool.query<ArtistRow>(
    "SELECT id, google_calendar_id, is_active FROM artists WHERE id = $1",
    [artistId]
  );
  return rows[0] ?? null;
}

/**
 * Pulls everything that changed on an artist's Google Calendar since the
 * last sync and reconciles it into bookings / calendar_blocks. Safe to call
 * repeatedly — every step is idempotent against re-processing the same
 * event twice (e.g. our own writes bouncing back through the webhook).
 */
export async function reconcileArtistCalendar(artistId: number): Promise<{ processed: number }> {
  const artist = await getArtist(artistId);
  if (!artist?.google_calendar_id) {
    return { processed: 0 };
  }

  const provider = getCalendarProvider();
  const { rows } = await pool.query<{ sync_token: string | null }>(
    "SELECT sync_token FROM calendar_watch_channels WHERE artist_id = $1",
    [artistId]
  );
  const storedSyncToken = rows[0]?.sync_token ?? undefined;

  let page = await provider.listChanges(artist.google_calendar_id, storedSyncToken);

  // Google invalidated our token — fall back to a full resync from now.
  if (page.syncTokenExpired) {
    page = await provider.listChanges(artist.google_calendar_id);
  }

  for (const event of page.events) {
    await processRemoteEvent(artistId, event);
  }

  if (page.nextSyncToken) {
    await pool.query(
      `UPDATE calendar_watch_channels SET sync_token = $1, updated_at = now() WHERE artist_id = $2`,
      [page.nextSyncToken, artistId]
    );
  }

  return { processed: page.events.length };
}

async function processRemoteEvent(artistId: number, event: CalendarEvent) {
  const eposType = event.metadata?.eposType;
  const eposId = event.metadata?.eposId ? Number(event.metadata.eposId) : null;

  if (event.status === "cancelled") {
    if (eposType === "booking" && eposId) {
      await cancelBookingFromRemote(eposId, event.id);
    } else {
      // Either a block we created, or an external event removed directly
      // in Google Calendar — either way, the block-out no longer applies.
      await pool.query("DELETE FROM calendar_blocks WHERE google_calendar_event_id = $1", [event.id]);
    }
    return;
  }

  if (eposType === "booking" && eposId) {
    await syncBookingTimesFromRemote(eposId, event);
    return;
  }

  if (eposType === "block" && eposId) {
    await syncBlockFromRemote(eposId, event);
    return;
  }

  // No EPOS metadata — this event was created directly on the artist's
  // calendar (holiday, personal appointment, etc). Treat it as the source
  // of truth that it is: a block-out against EPOS bookings.
  await upsertExternalBlock(artistId, event);
}

async function cancelBookingFromRemote(bookingId: number, eventId: string) {
  const { rows } = await pool.query<{ status: string }>(
    "SELECT status FROM bookings WHERE id = $1 AND google_calendar_event_id = $2",
    [bookingId, eventId]
  );
  const booking = rows[0];
  if (!booking || booking.status === "cancelled") return;

  await pool.query(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1",
    [bookingId]
  );
  await pool.query(
    `INSERT INTO booking_events (booking_id, event_type, notes) VALUES ($1, 'cancelled', $2)`,
    [bookingId, "Cancelled directly on Google Calendar"]
  );
}

// Times are the one thing we sync back from a manual edit in Google
// Calendar. Pricing (hourly_rate_snapshot, subtotal/total/deposit) is never
// touched here — it was frozen at booking time on purpose and an artist
// dragging an event to a new slot shouldn't silently change what the client
// owes. Edit the price through the booking API if that's genuinely needed.
async function syncBookingTimesFromRemote(bookingId: number, event: CalendarEvent) {
  const { rows } = await pool.query<{ starts_at: string; ends_at: string; status: string }>(
    "SELECT starts_at, ends_at, status FROM bookings WHERE id = $1 AND google_calendar_event_id = $2",
    [bookingId, event.id]
  );
  const booking = rows[0];
  if (!booking || booking.status === "cancelled") return;

  const sameStart = new Date(booking.starts_at).getTime() === event.startsAt.getTime();
  const sameEnd = new Date(booking.ends_at).getTime() === event.endsAt.getTime();
  if (sameStart && sameEnd) return;

  const durationMinutes = Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60000);
  await pool.query(
    `UPDATE bookings
     SET starts_at = $1, ends_at = $2, duration_minutes = $3, duration_hours = $4, updated_at = now()
     WHERE id = $5`,
    [event.startsAt, event.endsAt, durationMinutes, durationMinutes / 60, bookingId]
  );
  await pool.query(
    `INSERT INTO booking_events (booking_id, event_type, old_value, new_value, notes)
     VALUES ($1, 'rescheduled', $2, $3, 'Time changed directly on Google Calendar')`,
    [bookingId, booking.starts_at, event.startsAt.toISOString()]
  );
}

async function syncBlockFromRemote(blockId: number, event: CalendarEvent) {
  await pool.query(
    `UPDATE calendar_blocks
     SET starts_at = $1, ends_at = $2, reason = $3, updated_at = now()
     WHERE id = $4 AND google_calendar_event_id = $5`,
    [event.startsAt, event.endsAt, event.summary ?? null, blockId, event.id]
  );
}

async function upsertExternalBlock(artistId: number, event: CalendarEvent) {
  await pool.query(
    `INSERT INTO calendar_blocks (artist_id, starts_at, ends_at, reason, source, google_calendar_event_id)
     VALUES ($1, $2, $3, $4, 'google_calendar', $5)
     ON CONFLICT (google_calendar_event_id)
     DO UPDATE SET starts_at = $2, ends_at = $3, reason = $4, updated_at = now()`,
    [artistId, event.startsAt, event.endsAt, event.summary ?? null, event.id]
  );
}
