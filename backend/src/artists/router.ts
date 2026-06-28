import { randomBytes } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db";
import { requireAuth, requireAdmin } from "../auth/middleware";
import { resolveRate } from "../bookings/pricing";
import { startWatchForArtist, stopWatchForArtist } from "../calendar/watch";
import { logActivity } from "../activity/log";

export const artistsRouter = Router();
artistsRouter.use(requireAuth);

interface ArtistRow {
  id: number;
  display_name: string;
  profile_image_url: string | null;
  is_active: boolean;
}

interface FullArtistRow {
  id: number;
  user_id: number;
  display_name: string;
  bio: string | null;
  profile_image_url: string | null;
  google_calendar_id: string | null;
  default_hourly_rate: string | null;
  is_active: boolean;
  email: string;
  is_admin: boolean;
}

function toFullArtist(row: FullArtistRow) {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    bio: row.bio,
    profileImageUrl: row.profile_image_url,
    googleCalendarId: row.google_calendar_id,
    defaultHourlyRate: row.default_hourly_rate === null ? null : Number(row.default_hourly_rate),
    isActive: row.is_active,
    email: row.email,
    isAdmin: row.is_admin,
  };
}

function generatePassword() {
  return randomBytes(9).toString("base64url");
}

artistsRouter.get("/", async (_req, res) => {
  const { rows } = await pool.query<ArtistRow>(
    "SELECT id, display_name, profile_image_url, is_active FROM artists WHERE is_active = TRUE ORDER BY display_name"
  );
  res.json(
    rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      profileImageUrl: row.profile_image_url,
    }))
  );
});

// The artist record tied to the logged-in user — every account is an
// artist account, so the booking wizard defaults to "booking for myself"
// using this before letting the user switch to someone else.
artistsRouter.get("/me", async (req, res) => {
  const { rows } = await pool.query<ArtistRow>(
    "SELECT id, display_name, profile_image_url, is_active FROM artists WHERE user_id = $1",
    [req.user!.id]
  );
  const artist = rows[0];
  if (!artist) {
    res.status(404).json({ error: "No artist record for this account" });
    return;
  }
  res.json({ id: artist.id, displayName: artist.display_name, profileImageUrl: artist.profile_image_url });
});

artistsRouter.get("/:artistId/services/:serviceId/rate", async (req, res) => {
  try {
    const rate = await resolveRate(Number(req.params.artistId), Number(req.params.serviceId));
    res.json(rate);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ---------- Admin: manage artists ----------
// Every login account is an artist account (see db.ts), so "sign up a new
// artist" means creating both the user row (for login) and the artists row
// (for bookings/calendar) together. There's no self-service register flow —
// this is the only way new accounts get created.

artistsRouter.get("/admin", requireAdmin, async (_req, res) => {
  const { rows } = await pool.query<FullArtistRow>(
    `SELECT a.id, a.user_id, a.display_name, a.bio, a.profile_image_url, a.google_calendar_id,
            a.default_hourly_rate, a.is_active, u.email, u.is_admin
     FROM artists a
     JOIN users u ON u.id = a.user_id
     ORDER BY a.display_name`
  );
  res.json(rows.map(toFullArtist));
});

artistsRouter.post("/admin", requireAdmin, async (req, res) => {
  const { email, displayName, isAdmin, googleCalendarId, defaultHourlyRate, bio } = req.body as {
    email?: string;
    displayName?: string;
    isAdmin?: boolean;
    googleCalendarId?: string;
    defaultHourlyRate?: number;
    bio?: string;
  };

  if (!email || !displayName) {
    res.status(400).json({ error: "email and displayName are required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [
    normalizedEmail,
  ]);
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const temporaryPassword = generatePassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: userRows } = await client.query(
      "INSERT INTO users (email, password_hash, name, is_admin) VALUES ($1, $2, $3, $4) RETURNING id",
      [normalizedEmail, passwordHash, displayName, isAdmin ?? false]
    );
    const userId = userRows[0].id;

    const { rows: artistRows } = await client.query<FullArtistRow>(
      `INSERT INTO artists (user_id, display_name, bio, google_calendar_id, default_hourly_rate)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, display_name, bio, profile_image_url, google_calendar_id, default_hourly_rate, is_active`,
      [userId, displayName, bio ?? null, googleCalendarId ?? null, defaultHourlyRate ?? null]
    );
    await client.query("COMMIT");

    const artist = toFullArtist({ ...artistRows[0], email: normalizedEmail, is_admin: isAdmin ?? false });

    await logActivity({
      entityType: "artist",
      entityId: artist.id,
      eventType: "created",
      actorUserId: req.user!.id,
      description: `Artist ${displayName} signed up (${normalizedEmail})`,
      metadata: { email: normalizedEmail, isAdmin: isAdmin ?? false },
    });

    if (googleCalendarId) {
      startWatchForArtist(artist.id).catch((err) =>
        console.error(`Failed to start Google Calendar watch for new artist ${artist.id}`, err)
      );
    }

    res.status(201).json({ artist, temporaryPassword });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

artistsRouter.patch("/admin/:id", requireAdmin, async (req, res) => {
  const artistId = Number(req.params.id);
  const { rows } = await pool.query<FullArtistRow>(
    `SELECT a.id, a.user_id, a.display_name, a.bio, a.profile_image_url, a.google_calendar_id,
            a.default_hourly_rate, a.is_active, u.email, u.is_admin
     FROM artists a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
    [artistId]
  );
  const existing = rows[0];
  if (!existing) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }

  const body = req.body as {
    displayName?: string;
    bio?: string | null;
    profileImageUrl?: string | null;
    googleCalendarId?: string | null;
    defaultHourlyRate?: number | null;
    isActive?: boolean;
    isAdmin?: boolean;
  };

  const updates: string[] = [];
  const params: unknown[] = [];
  const fieldMap: Record<string, string> = {
    displayName: "display_name",
    bio: "bio",
    profileImageUrl: "profile_image_url",
    googleCalendarId: "google_calendar_id",
    defaultHourlyRate: "default_hourly_rate",
    isActive: "is_active",
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in body) {
      params.push((body as Record<string, unknown>)[key]);
      updates.push(`${column} = $${params.length}`);
    }
  }

  if (updates.length > 0) {
    params.push(artistId);
    await pool.query(
      `UPDATE artists SET ${updates.join(", ")}, updated_at = now() WHERE id = $${params.length}`,
      params
    );
  }

  if (body.isAdmin !== undefined) {
    await pool.query("UPDATE users SET is_admin = $1 WHERE id = $2", [body.isAdmin, existing.user_id]);
  }

  const diffMap: Record<string, string> = { ...fieldMap, isAdmin: "is_admin" };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(diffMap)) {
    if (!(key in body)) continue;
    const from = (existing as unknown as Record<string, unknown>)[diffMap[key]];
    const to = (body as Record<string, unknown>)[key];
    if (from !== to) changes[key] = { from, to };
  }
  await logActivity({
    entityType: "artist",
    entityId: artistId,
    eventType: "updated",
    actorUserId: req.user!.id,
    description: `Artist ${existing.display_name} updated`,
    changes,
  });

  const calendarIdChanged =
    body.googleCalendarId !== undefined && body.googleCalendarId !== existing.google_calendar_id;
  if (calendarIdChanged) {
    if (body.googleCalendarId) {
      startWatchForArtist(artistId).catch((err) =>
        console.error(`Failed to start Google Calendar watch for artist ${artistId}`, err)
      );
    } else {
      stopWatchForArtist(artistId).catch((err) =>
        console.error(`Failed to stop Google Calendar watch for artist ${artistId}`, err)
      );
    }
  }

  const { rows: updatedRows } = await pool.query<FullArtistRow>(
    `SELECT a.id, a.user_id, a.display_name, a.bio, a.profile_image_url, a.google_calendar_id,
            a.default_hourly_rate, a.is_active, u.email, u.is_admin
     FROM artists a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
    [artistId]
  );
  res.json(toFullArtist(updatedRows[0]));
});

// Artists are never hard-deleted — bookings reference them with ON DELETE
// RESTRICT, and historical records need to keep pointing at someone.
// "Removing" an artist means deactivating the account.
artistsRouter.delete("/admin/:id", requireAdmin, async (req, res) => {
  const artistId = Number(req.params.id);
  const { rows } = await pool.query("SELECT id FROM artists WHERE id = $1", [artistId]);
  if (!rows[0]) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }

  await pool.query("UPDATE artists SET is_active = FALSE, updated_at = now() WHERE id = $1", [
    artistId,
  ]);
  await logActivity({
    entityType: "artist",
    entityId: artistId,
    eventType: "deactivated",
    actorUserId: req.user!.id,
    description: `Artist #${artistId} deactivated`,
  });
  await stopWatchForArtist(artistId).catch((err) =>
    console.error(`Failed to stop Google Calendar watch for deactivated artist ${artistId}`, err)
  );

  res.json({ status: "deactivated" });
});
