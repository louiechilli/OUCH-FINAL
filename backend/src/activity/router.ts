import { Router } from "express";
import { pool } from "../db";
import { requireAuth, requireAdmin } from "../auth/middleware";

export const activityRouter = Router();
activityRouter.use(requireAuth, requireAdmin);

// GET /api/activity?entityType=booking&entityId=42&eventType=cancelled&actorUserId=3&limit=50&offset=0
activityRouter.get("/", async (req, res) => {
  const { entityType, entityId, eventType, actorUserId } = req.query as Record<
    string,
    string | undefined
  >;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entityType) {
    params.push(entityType);
    conditions.push(`entity_type = $${params.length}`);
  }
  if (entityId) {
    params.push(Number(entityId));
    conditions.push(`entity_id = $${params.length}`);
  }
  if (eventType) {
    params.push(eventType);
    conditions.push(`event_type = $${params.length}`);
  }
  if (actorUserId) {
    params.push(Number(actorUserId));
    conditions.push(`actor_user_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT al.*, u.name AS actor_name
     FROM activity_log al
     LEFT JOIN users u ON u.id = al.actor_user_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json(rows);
});

// Convenience: full timeline for one specific record, e.g. /api/activity/booking/42
activityRouter.get("/:entityType/:entityId", async (req, res) => {
  const { entityType, entityId } = req.params;
  const { rows } = await pool.query(
    `SELECT al.*, u.name AS actor_name
     FROM activity_log al
     LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE al.entity_type = $1 AND al.entity_id = $2
     ORDER BY al.created_at DESC`,
    [entityType, Number(entityId)]
  );
  res.json(rows);
});
