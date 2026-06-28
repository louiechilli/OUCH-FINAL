import { Router } from "express";
import { pool } from "../db";
import { requireAuth, requireAdmin } from "../auth/middleware";
import { reconcileArtistCalendar } from "./sync";
import { startWatchForArtist, stopWatchForArtist } from "./watch";

export const calendarRouter = Router();

// Google's push notification receiver. No Bearer auth — Google calls this
// directly — instead we verify the X-Goog-Channel-Token we generated and
// stored when the watch was registered, so a request claiming to be from a
// channel we never created (or with the wrong token) is dropped.
calendarRouter.post("/webhook", async (req, res) => {
  const channelId = req.header("X-Goog-Channel-Id");
  const channelToken = req.header("X-Goog-Channel-Token");
  const resourceState = req.header("X-Goog-Resource-State");

  if (!channelId) {
    res.status(400).end();
    return;
  }

  const { rows } = await pool.query<{ artist_id: number; channel_token: string }>(
    "SELECT artist_id, channel_token FROM calendar_watch_channels WHERE channel_id = $1",
    [channelId]
  );
  const channel = rows[0];

  if (!channel || channel.channel_token !== channelToken) {
    res.status(404).end();
    return;
  }

  // "sync" is just Google confirming the channel was created — nothing to
  // reconcile yet. Always 200 quickly; Google retries with backoff on
  // anything else and will eventually disable the channel.
  res.status(200).end();

  if (resourceState === "sync") return;

  reconcileArtistCalendar(channel.artist_id).catch((err) => {
    console.error(`Calendar webhook reconcile failed for artist ${channel.artist_id}`, err);
  });
});

calendarRouter.post("/artists/:artistId/watch", requireAuth, requireAdmin, async (req, res) => {
  const artistId = Number(req.params.artistId);
  try {
    const channel = await startWatchForArtist(artistId);
    res.json({ status: "watching", channel });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

calendarRouter.delete("/artists/:artistId/watch", requireAuth, requireAdmin, async (req, res) => {
  const artistId = Number(req.params.artistId);
  await stopWatchForArtist(artistId);
  res.json({ status: "stopped" });
});

calendarRouter.post("/artists/:artistId/sync", requireAuth, requireAdmin, async (req, res) => {
  const artistId = Number(req.params.artistId);

  if (req.query.full === "true") {
    await pool.query("UPDATE calendar_watch_channels SET sync_token = NULL WHERE artist_id = $1", [
      artistId,
    ]);
  }

  try {
    const result = await reconcileArtistCalendar(artistId);
    res.json({ status: "synced", ...result });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
