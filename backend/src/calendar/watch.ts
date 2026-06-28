import { randomBytes, randomUUID } from "node:crypto";
import { pool } from "../db";
import { getCalendarProvider } from "./index";
import { reconcileArtistCalendar } from "./sync";

function webhookUrl() {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) throw new Error("PUBLIC_BASE_URL is not set — required to register Google push notifications");
  return `${base.replace(/\/$/, "")}/api/calendar/webhook`;
}

interface ArtistRow {
  id: number;
  google_calendar_id: string | null;
}

async function getArtist(artistId: number): Promise<ArtistRow | null> {
  const { rows } = await pool.query<ArtistRow>(
    "SELECT id, google_calendar_id FROM artists WHERE id = $1",
    [artistId]
  );
  return rows[0] ?? null;
}

export async function startWatchForArtist(artistId: number) {
  const artist = await getArtist(artistId);
  if (!artist?.google_calendar_id) {
    throw new Error("Artist has no google_calendar_id configured");
  }

  const provider = getCalendarProvider();
  const channelId = randomUUID();
  const channelToken = randomBytes(24).toString("hex");

  const channel = await provider.watch(artist.google_calendar_id, channelId, webhookUrl(), channelToken);

  await pool.query(
    `INSERT INTO calendar_watch_channels (artist_id, channel_id, resource_id, channel_token, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (artist_id)
     DO UPDATE SET channel_id = $2, resource_id = $3, channel_token = $4, expires_at = $5, updated_at = now()`,
    [artistId, channel.channelId, channel.resourceId, channelToken, channel.expiresAt]
  );

  // First sync establishes a sync token and backfills any block-outs that
  // already exist on the calendar before we started watching it.
  await reconcileArtistCalendar(artistId);

  return channel;
}

export async function stopWatchForArtist(artistId: number) {
  const { rows } = await pool.query<{ channel_id: string; resource_id: string | null }>(
    "SELECT channel_id, resource_id FROM calendar_watch_channels WHERE artist_id = $1",
    [artistId]
  );
  const row = rows[0];
  if (!row?.resource_id) {
    await pool.query("DELETE FROM calendar_watch_channels WHERE artist_id = $1", [artistId]);
    return;
  }

  const provider = getCalendarProvider();
  await provider.stopWatch(row.channel_id, row.resource_id);
  await pool.query("DELETE FROM calendar_watch_channels WHERE artist_id = $1", [artistId]);
}

/**
 * Google push-notification channels expire (max ~a few weeks for Calendar).
 * Re-watching just creates a fresh channel — there's no "renew" call — so we
 * find anything expiring soon and re-run startWatchForArtist for it.
 */
export async function renewExpiringWatches() {
  const { rows } = await pool.query<{ artist_id: number }>(
    `SELECT artist_id FROM calendar_watch_channels
     WHERE expires_at IS NOT NULL AND expires_at < now() + interval '24 hours'`
  );

  for (const row of rows) {
    try {
      await startWatchForArtist(row.artist_id);
      console.log(`Renewed Google Calendar watch for artist ${row.artist_id}`);
    } catch (err) {
      console.error(`Failed to renew Google Calendar watch for artist ${row.artist_id}`, err);
    }
  }
}

/** Best-effort: watch every active artist with a calendar configured. Skips
 * (and logs) artists that fail so one bad calendar id doesn't block boot. */
export async function startWatchesForAllActiveArtists() {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT a.id FROM artists a
     LEFT JOIN calendar_watch_channels w ON w.artist_id = a.id
     WHERE a.is_active = TRUE AND a.google_calendar_id IS NOT NULL AND w.id IS NULL`
  );

  for (const row of rows) {
    try {
      await startWatchForArtist(row.id);
      console.log(`Started Google Calendar watch for artist ${row.id}`);
    } catch (err) {
      console.error(`Failed to start Google Calendar watch for artist ${row.id}`, err);
    }
  }
}
