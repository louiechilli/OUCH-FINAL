import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth/middleware";
import { logActivity, diffFields } from "../activity/log";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

interface SettingsRow {
  user_id: number;
  email: string;
  name: string;
  artist_id: number;
  display_name: string;
  bio: string | null;
  profile_image_url: string | null;
  social_links: Record<string, string>;
}

const SOCIAL_KEYS = ["instagram", "tiktok", "facebook", "twitter", "website"] as const;

function normalizeSocialLinks(raw: unknown): Record<string, string> | null {
  if (raw === undefined) return null;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const links: Record<string, string> = {};
  for (const key of SOCIAL_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) links[key] = trimmed;
  }
  return links;
}

async function getSettingsForUser(userId: number): Promise<SettingsRow | null> {
  const { rows } = await pool.query<SettingsRow>(
    `SELECT u.id AS user_id, u.email, u.name,
            a.id AS artist_id, a.display_name, a.bio, a.profile_image_url, a.social_links
     FROM users u
     JOIN artists a ON a.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

function toSettingsResponse(row: SettingsRow) {
  return {
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
    },
    artist: {
      id: row.artist_id,
      displayName: row.display_name,
      bio: row.bio,
      profileImageUrl: row.profile_image_url,
      socialLinks: row.social_links ?? {},
    },
  };
}

settingsRouter.get("/me", async (req, res) => {
  const row = await getSettingsForUser(req.user!.id);
  if (!row) {
    res.status(404).json({ error: "No profile found for this account" });
    return;
  }
  res.json(toSettingsResponse(row));
});

settingsRouter.patch("/me", async (req, res) => {
  const body = req.body as {
    name?: string;
    email?: string;
    displayName?: string;
    profileImageUrl?: string | null;
    bio?: string | null;
    socialLinks?: unknown;
  };

  const row = await getSettingsForUser(req.user!.id);
  if (!row) {
    res.status(404).json({ error: "No profile found for this account" });
    return;
  }

  const userUpdates: string[] = [];
  const userParams: unknown[] = [];

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    userUpdates.push(`name = $${userParams.length + 1}`);
    userParams.push(name);
  }

  if (body.email !== undefined) {
    const email = body.email.toLowerCase().trim();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }
    const { rows: existing } = await pool.query<{ id: number }>(
      "SELECT id FROM users WHERE email = $1 AND id != $2",
      [email, req.user!.id]
    );
    if (existing.length > 0) {
      res.status(409).json({ error: "That email is already in use" });
      return;
    }
    userUpdates.push(`email = $${userParams.length + 1}`);
    userParams.push(email);
  }

  const artistUpdates: string[] = [];
  const artistParams: unknown[] = [];

  if (body.displayName !== undefined) {
    const displayName = body.displayName.trim();
    if (!displayName) {
      res.status(400).json({ error: "Display name is required" });
      return;
    }
    artistUpdates.push(`display_name = $${artistParams.length + 1}`);
    artistParams.push(displayName);
  }

  if (body.profileImageUrl !== undefined) {
    const url = body.profileImageUrl?.trim() || null;
    artistUpdates.push(`profile_image_url = $${artistParams.length + 1}`);
    artistParams.push(url);
  }

  if (body.bio !== undefined) {
    const bio = body.bio?.trim() || null;
    artistUpdates.push(`bio = $${artistParams.length + 1}`);
    artistParams.push(bio);
  }

  if (body.socialLinks !== undefined) {
    const socialLinks = normalizeSocialLinks(body.socialLinks);
    if (!socialLinks) {
      res.status(400).json({ error: "socialLinks must be an object" });
      return;
    }
    artistUpdates.push(`social_links = $${artistParams.length + 1}`);
    artistParams.push(JSON.stringify(socialLinks));
  }

  if (userUpdates.length === 0 && artistUpdates.length === 0) {
    res.status(400).json({ error: "No changes provided" });
    return;
  }

  if (userUpdates.length > 0) {
    userParams.push(req.user!.id);
    await pool.query(
      `UPDATE users SET ${userUpdates.join(", ")} WHERE id = $${userParams.length}`,
      userParams
    );
  }

  if (artistUpdates.length > 0) {
    artistUpdates.push("updated_at = now()");
    artistParams.push(req.user!.id);
    await pool.query(
      `UPDATE artists SET ${artistUpdates.join(", ")} WHERE user_id = $${artistParams.length}`,
      artistParams
    );
  }

  const updated = await getSettingsForUser(req.user!.id);
  if (!updated) {
    res.status(404).json({ error: "No profile found for this account" });
    return;
  }

  await logActivity({
    entityType: "user",
    entityId: req.user!.id,
    eventType: "profile_updated",
    actorUserId: req.user!.id,
    description: `${updated.name} updated their profile`,
    changes: diffFields(
      row as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ["name", "email", "display_name", "profile_image_url", "bio"]
    ),
  });

  res.json(toSettingsResponse(updated));
});
