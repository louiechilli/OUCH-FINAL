import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth/middleware";
import { removeBlockFromCalendar, syncBlockToCalendar } from "./calendarSync";

export const blocksRouter = Router();
blocksRouter.use(requireAuth);

blocksRouter.get("/", async (req, res) => {
  const { artistId } = req.query as Record<string, string | undefined>;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (artistId) {
    params.push(Number(artistId));
    conditions.push(`artist_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM calendar_blocks ${where} ORDER BY starts_at ASC`,
    params
  );
  res.json(rows);
});

blocksRouter.post("/", async (req, res) => {
  const { artistId, startsAt, endsAt, reason } = req.body as Record<string, unknown>;

  if (!artistId || !startsAt || !endsAt) {
    res.status(400).json({ error: "artistId, startsAt and endsAt are required" });
    return;
  }

  const starts = new Date(startsAt as string);
  const ends = new Date(endsAt as string);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
    res.status(400).json({ error: "Invalid startsAt/endsAt" });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO calendar_blocks (artist_id, starts_at, ends_at, reason, source)
     VALUES ($1, $2, $3, $4, 'admin') RETURNING *`,
    [artistId, starts, ends, reason ?? null]
  );
  const block = rows[0];

  try {
    await syncBlockToCalendar(block.id);
  } catch (err) {
    console.error(`Failed to push block ${block.id} to Google Calendar`, err);
    res.status(201).json({ ...block, calendarSyncError: (err as Error).message });
    return;
  }

  const { rows: refreshed } = await pool.query("SELECT * FROM calendar_blocks WHERE id = $1", [
    block.id,
  ]);
  res.status(201).json(refreshed[0]);
});

blocksRouter.delete("/:id", async (req, res) => {
  const blockId = Number(req.params.id);
  const { rows } = await pool.query("SELECT * FROM calendar_blocks WHERE id = $1", [blockId]);
  if (!rows[0]) {
    res.status(404).json({ error: "Block not found" });
    return;
  }

  await removeBlockFromCalendar(blockId).catch((err) =>
    console.error(`Failed to remove block ${blockId} from Google Calendar`, err)
  );
  await pool.query("DELETE FROM calendar_blocks WHERE id = $1", [blockId]);

  res.json({ status: "deleted" });
});
