import { pool } from "../db";

// Free-text on purpose — see db.ts. These lists are the conventions used so
// far, not an enforced enum; add new ones inline wherever they're needed.
export type EntityType =
  | "user"
  | "artist"
  | "client"
  | "booking"
  | "calendar_block"
  | "category"
  | "service"
  | "consent_submission"
  | "booking_message"
  | "permission"
  | "push_subscription"
  | "notification"
  | "calendar_watch";

export interface LogActivityInput {
  entityType: EntityType | string;
  /** Null for events with no single row, e.g. a login attempt before a session exists. */
  entityId?: number | null;
  eventType: string;
  /** Who did it. Omit for system-driven events (calendar sync, scheduled jobs) and use actorLabel instead. */
  actorUserId?: number | null;
  /** e.g. "google_calendar", "system" — set when there's no actorUserId. */
  actorLabel?: string | null;
  description: string;
  /** Typically { field: { from, to } } for updates. */
  changes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Single entry point for the audit trail. Every mutation in the app should
 * call this alongside its actual write. Logging failures are swallowed —
 * an audit-trail outage must never block the real operation it's observing.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_log
         (entity_type, entity_id, event_type, actor_user_id, actor_label, description, changes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.entityType,
        input.entityId ?? null,
        input.eventType,
        input.actorUserId ?? null,
        input.actorLabel ?? null,
        input.description,
        input.changes ? JSON.stringify(input.changes) : null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
  } catch (err) {
    console.error("Failed to write activity log", input, err);
  }
}

/** Builds a { field: { from, to } } diff for the `changes` column from two
 * snake_case row objects, only including keys that actually changed. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    if (before[field] !== after[field]) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  return changes;
}
