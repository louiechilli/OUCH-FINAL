import { randomBytes } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db";
import { signAccessToken } from "./jwt";
import { requireAuth } from "./middleware";

export const authRouter = Router();

// "Logged in forever" — refresh tokens are long-lived and only invalidated by
// explicit logout. The 6-digit PIN is the real re-auth gate, not token expiry.
const REFRESH_TOKEN_TTL_DAYS = 3650;

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  is_admin: boolean;
  pin_hash: string | null;
}

function toPublicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.is_admin,
    pinRequired: !user.pin_hash,
  };
}

async function createRefreshToken(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
    [userId, token, expiresAt]
  );
  return token;
}

async function getUserByRefreshToken(token: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT u.* FROM users u
     JOIN refresh_tokens rt ON rt.user_id = u.id
     WHERE rt.token = $1 AND rt.expires_at > now()`,
    [token]
  );
  return rows[0] ?? null;
}

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const { rows } = await pool.query<UserRow>("SELECT * FROM users WHERE email = $1", [
    email.toLowerCase().trim(),
  ]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const refreshToken = await createRefreshToken(user.id);
  const accessToken = signAccessToken({ sub: user.id, isAdmin: user.is_admin });

  res.json({ accessToken, refreshToken, user: toPublicUser(user) });
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: "refreshToken is required" });
    return;
  }

  const user = await getUserByRefreshToken(refreshToken);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const accessToken = signAccessToken({ sub: user.id, isAdmin: user.is_admin });
  res.json({ accessToken, user: toPublicUser(user) });
});

authRouter.post("/pin/setup", requireAuth, async (req, res) => {
  const { pin, confirmPin } = req.body as { pin?: string; confirmPin?: string };
  const isSixDigits = (value: unknown) => typeof value === "string" && /^\d{6}$/.test(value);

  if (!isSixDigits(pin) || !isSixDigits(confirmPin)) {
    res.status(400).json({ error: "PIN must be exactly 6 digits" });
    return;
  }
  if (pin !== confirmPin) {
    res.status(400).json({ error: "PIN and confirmation do not match" });
    return;
  }

  const pinHash = await bcrypt.hash(pin!, 10);
  await pool.query("UPDATE users SET pin_hash = $1 WHERE id = $2", [pinHash, req.user!.id]);

  res.json({ status: "ok" });
});

authRouter.post("/pin/verify", async (req, res) => {
  const { refreshToken, pin } = req.body as { refreshToken?: string; pin?: string };
  if (!refreshToken || !pin) {
    res.status(400).json({ error: "refreshToken and pin are required" });
    return;
  }

  const user = await getUserByRefreshToken(refreshToken);
  if (!user || !user.pin_hash || !(await bcrypt.compare(pin, user.pin_hash))) {
    res.status(401).json({ error: "Incorrect PIN" });
    return;
  }

  const accessToken = signAccessToken({ sub: user.id, isAdmin: user.is_admin });
  res.json({ accessToken, user: toPublicUser(user) });
});

authRouter.post("/logout", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    await pool.query("DELETE FROM refresh_tokens WHERE token = $1", [refreshToken]);
  }
  res.json({ status: "ok" });
});
