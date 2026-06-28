import { Router } from "express";
import { requireAdmin } from "../auth/middleware";
import { pool } from "../db";
import { getSmsProvider } from "../sms";
import { checkRedisConnection, getSmsQueueStats } from "../sms/queue";
import { enqueueSmsToClient, listRecentSmsMessages } from "../sms/service";

export const testingRouter = Router();

testingRouter.use(requireAdmin);

testingRouter.get("/status", async (_req, res) => {
  const [redisOk, queueStats, bookingCount] = await Promise.all([
    checkRedisConnection(),
    getSmsQueueStats().catch(() => null),
    pool.query("SELECT COUNT(*)::int AS count FROM bookings").then(({ rows }) => rows[0].count as number),
  ]);

  res.json({
    redis: { connected: redisOk },
    sms: getSmsProvider().getConfigStatus(),
    queue: queueStats,
    bookings: { count: bookingCount },
  });
});

testingRouter.get("/sms/messages", async (_req, res) => {
  const messages = await listRecentSmsMessages();
  res.json({ messages });
});

testingRouter.post("/sms/send", async (req, res) => {
  const { clientId, message } = req.body as { clientId?: number; message?: string };

  if (!clientId || !Number.isInteger(clientId) || clientId <= 0) {
    res.status(400).json({ error: "clientId is required" });
    return;
  }
  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    const sms = await enqueueSmsToClient(clientId, message.trim());
    res.status(201).json(sms);
  } catch (err) {
    const text = err instanceof Error ? err.message : "Could not queue SMS";
    if (text === "Client not found" || text === "Client has no phone number on file") {
      res.status(400).json({ error: text });
      return;
    }
    if (text.includes("not configured")) {
      res.status(503).json({ error: text });
      return;
    }
    console.error("Failed to queue SMS", err);
    res.status(500).json({ error: text });
  }
});

testingRouter.post("/bookings/clear", async (req, res) => {
  const { confirm } = req.body as { confirm?: string };
  if (confirm !== "DELETE ALL BOOKINGS") {
    res.status(400).json({ error: 'Send confirm: "DELETE ALL BOOKINGS" to proceed' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM bookings");
    const count = rows[0].count as number;

    await client.query("DELETE FROM activity_log WHERE entity_type = 'booking'");
    await client.query("DELETE FROM bookings");

    await client.query("COMMIT");
    res.json({ deleted: count });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to clear bookings", err);
    res.status(500).json({ error: "Could not clear bookings" });
  } finally {
    client.release();
  }
});
