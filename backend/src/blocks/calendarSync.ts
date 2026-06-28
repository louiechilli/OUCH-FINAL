import { pool } from "../db";
import { getCalendarProvider } from "../calendar";
import { metadataFor } from "../calendar/sync";

interface BlockForCalendar {
  id: number;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  google_calendar_event_id: string | null;
  google_calendar_id: string | null;
}

async function loadBlockForCalendar(blockId: number): Promise<BlockForCalendar | null> {
  const { rows } = await pool.query<BlockForCalendar>(
    `SELECT cb.id, cb.starts_at, cb.ends_at, cb.reason, cb.google_calendar_event_id, a.google_calendar_id
     FROM calendar_blocks cb
     JOIN artists a ON a.id = cb.artist_id
     WHERE cb.id = $1`,
    [blockId]
  );
  return rows[0] ?? null;
}

export async function syncBlockToCalendar(blockId: number): Promise<void> {
  const block = await loadBlockForCalendar(blockId);
  if (!block?.google_calendar_id) return;

  const provider = getCalendarProvider();
  const input = {
    summary: block.reason?.trim() || "Blocked",
    startsAt: new Date(block.starts_at),
    endsAt: new Date(block.ends_at),
    metadata: metadataFor("block", block.id),
  };

  if (block.google_calendar_event_id) {
    await provider.updateEvent(block.google_calendar_id, block.google_calendar_event_id, input);
    return;
  }

  const event = await provider.createEvent(block.google_calendar_id, input);
  await pool.query("UPDATE calendar_blocks SET google_calendar_event_id = $1 WHERE id = $2", [
    event.id,
    blockId,
  ]);
}

export async function removeBlockFromCalendar(blockId: number): Promise<void> {
  const block = await loadBlockForCalendar(blockId);
  if (!block?.google_calendar_id || !block.google_calendar_event_id) return;

  const provider = getCalendarProvider();
  await provider.deleteEvent(block.google_calendar_id, block.google_calendar_event_id);
}
