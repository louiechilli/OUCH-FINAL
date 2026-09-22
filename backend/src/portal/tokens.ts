import { createHash, randomBytes } from "crypto";
import { pool } from "../db";

const TOKEN_BYTES = 32;
const TOKEN_TTL_DAYS = 180;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getPortalBaseUrl(): string {
  const base = (process.env.PORTAL_BASE_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("PORTAL_BASE_URL or PUBLIC_BASE_URL must be set for client portal links");
  }
  return base;
}

export function buildPortalUrl(token: string): string {
  return `${getPortalBaseUrl()}/portal/${token}`;
}

export async function createPortalToken(bookingId: number): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + TOKEN_TTL_DAYS);

  await pool.query(
    `INSERT INTO booking_portal_tokens (booking_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (booking_id) DO UPDATE
       SET token_hash = EXCLUDED.token_hash,
           expires_at = EXCLUDED.expires_at,
           last_accessed_at = NULL`,
    [bookingId, tokenHash, expiresAt]
  );

  return token;
}

export interface PortalSession {
  tokenId: number;
  bookingId: number;
  clientId: number;
}

export async function validatePortalToken(token: string): Promise<PortalSession | null> {
  if (!token?.trim()) return null;

  const tokenHash = hashToken(token.trim());
  const { rows } = await pool.query<{
    id: number;
    booking_id: number;
    client_id: number;
    expires_at: Date;
    status: string;
  }>(
    `SELECT t.id, t.booking_id, t.expires_at, b.client_id, b.status
     FROM booking_portal_tokens t
     JOIN bookings b ON b.id = t.booking_id
     WHERE t.token_hash = $1`,
    [tokenHash]
  );

  const row = rows[0];
  if (!row || new Date(row.expires_at) <= new Date()) return null;
  if (row.status === "cancelled") return null;

  await pool.query("UPDATE booking_portal_tokens SET last_accessed_at = now() WHERE id = $1", [row.id]);

  return {
    tokenId: row.id,
    bookingId: row.booking_id,
    clientId: row.client_id,
  };
}
