import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth/middleware";
import { logActivity } from "../activity/log";
import { getClientHistory } from "./history";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

const CLIENT_LIST_SELECT = `
  SELECT c.*,
         COUNT(b.id)::int AS booking_count,
         MAX(b.starts_at) AS last_booking_at,
         COALESCE(SUM(CASE WHEN b.status = 'done' THEN b.total_amount ELSE 0 END), 0) AS total_spent
  FROM clients c
  LEFT JOIN bookings b ON b.client_id = c.id
`;

const CLIENT_GROUP_ORDER = `
  GROUP BY c.id
  ORDER BY MAX(b.starts_at) DESC NULLS LAST, c.created_at DESC
`;

clientsRouter.get("/", async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim();
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  if (!search) {
    const { rows } = await pool.query(
      `${CLIENT_LIST_SELECT}
       ${CLIENT_GROUP_ORDER}
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
    return;
  }

  const { rows } = await pool.query(
    `${CLIENT_LIST_SELECT}
     WHERE c.first_name ILIKE $1
        OR c.last_name ILIKE $1
        OR c.email ILIKE $1
        OR c.phone ILIKE $1
        OR (c.first_name || ' ' || c.last_name) ILIKE $1
     ${CLIENT_GROUP_ORDER}
     LIMIT $2`,
    [`%${search}%`, limit]
  );
  res.json(rows);
});

clientsRouter.get("/:id/history", async (req, res) => {
  const clientId = Number(req.params.id);
  if (!Number.isFinite(clientId)) {
    res.status(400).json({ error: "Invalid client id" });
    return;
  }

  const history = await getClientHistory(clientId);
  if (!history) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(history);
});

clientsRouter.get("/:id", async (req, res) => {
  const clientId = Number(req.params.id);
  if (!Number.isFinite(clientId)) {
    res.status(400).json({ error: "Invalid client id" });
    return;
  }

  const { rows } = await pool.query(
    `${CLIENT_LIST_SELECT}
     WHERE c.id = $1
     ${CLIENT_GROUP_ORDER}`,
    [clientId]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(rows[0]);
});

clientsRouter.post("/", async (req, res) => {
  const { firstName, lastName, email, phone, dateOfBirth, notes } = req.body as Record<
    string,
    unknown
  >;

  if (!firstName || !lastName) {
    res.status(400).json({ error: "firstName and lastName are required" });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO clients (first_name, last_name, email, phone, date_of_birth, notes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [firstName, lastName, email ?? null, phone ?? null, dateOfBirth ?? null, notes ?? null]
  );
  const client = rows[0];
  await logActivity({
    entityType: "client",
    entityId: client.id,
    eventType: "created",
    actorUserId: req.user!.id,
    description: `Client ${client.first_name} ${client.last_name} created`,
  });

  res.status(201).json(client);
});
