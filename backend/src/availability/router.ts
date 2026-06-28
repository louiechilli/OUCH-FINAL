import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth/middleware";
import { zonedTimeToUtc } from "../lib/timezone";

export const availabilityRouter = Router();
availabilityRouter.use(requireAuth);

// No per-artist working-hours table exists yet — every artist is treated as
// open 09:00-18:00 in the studio's local timezone (see lib/timezone.ts).
// Slots are offered every 30 minutes. Revisit this once artists need their
// own hours; it's the one hardcoded assumption in this whole feature.
const OPEN_HOUR = 9;
const CLOSE_HOUR = 18;
const SLOT_STEP_MINUTES = 30;

interface BusyRange {
  startsAt: number;
  endsAt: number;
}

function nextDateKey(dateKey: string): string {
  const next = new Date(`${dateKey}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

availabilityRouter.get("/", async (req, res) => {
  const artistId = Number(req.query.artistId);
  const date = req.query.date as string | undefined;
  const hours = Number(req.query.hours);
  const excludeBookingId = req.query.excludeBookingId
    ? Number(req.query.excludeBookingId)
    : undefined;

  if (!artistId || !date || !hours || hours <= 0) {
    res.status(400).json({ error: "artistId, date (YYYY-MM-DD) and hours are required" });
    return;
  }
  if (Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
    res.status(400).json({ error: "Invalid date" });
    return;
  }

  // Local-day boundaries (not UTC midnight) so a booking near midnight
  // doesn't get clipped out of the query window it actually belongs to.
  const dayStart = zonedTimeToUtc(date, 0, 0);
  const dayEnd = zonedTimeToUtc(nextDateKey(date), 0, 0);

  const [{ rows: bookingRows }, { rows: blockRows }] = await Promise.all([
    pool.query<{ starts_at: string; ends_at: string }>(
      `SELECT starts_at, ends_at FROM bookings
       WHERE artist_id = $1 AND status NOT IN ('cancelled', 'done') AND starts_at < $3 AND ends_at > $2
         AND ($4::int IS NULL OR id != $4)`,
      [artistId, dayStart, dayEnd, excludeBookingId ?? null]
    ),
    pool.query<{ starts_at: string; ends_at: string }>(
      `SELECT starts_at, ends_at FROM calendar_blocks
       WHERE artist_id = $1 AND starts_at < $3 AND ends_at > $2`,
      [artistId, dayStart, dayEnd]
    ),
  ]);

  const busy: BusyRange[] = [...bookingRows, ...blockRows].map((row) => ({
    startsAt: new Date(row.starts_at).getTime(),
    endsAt: new Date(row.ends_at).getTime(),
  }));

  const openAt = zonedTimeToUtc(date, OPEN_HOUR, 0).getTime();
  const closeAt = zonedTimeToUtc(date, CLOSE_HOUR, 0).getTime();
  const durationMs = hours * 60 * 60 * 1000;
  const stepMs = SLOT_STEP_MINUTES * 60 * 1000;

  const slots: Array<{ startsAt: string; endsAt: string }> = [];
  for (let start = openAt; start + durationMs <= closeAt; start += stepMs) {
    const end = start + durationMs;
    const overlaps = busy.some((range) => start < range.endsAt && end > range.startsAt);
    if (!overlaps) {
      slots.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
    }
  }

  res.json(slots);
});
