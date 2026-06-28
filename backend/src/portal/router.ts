import { Router } from "express";
import { pool } from "../db";
import { listBookingMessages, createBookingMessage } from "../bookings/messages";
import { requirePortalToken } from "./middleware";

export const portalRouter = Router({ mergeParams: true });

portalRouter.use(requirePortalToken);

portalRouter.get("/booking", async (req, res) => {
  const bookingId = req.portal!.bookingId;

  const { rows } = await pool.query(
    `SELECT b.id, b.status, b.starts_at, b.ends_at, b.client_notes,
            c.first_name AS client_first_name, c.last_name AS client_last_name,
            s.name AS service_name,
            a.display_name AS artist_display_name
     FROM bookings b
     JOIN clients c ON c.id = b.client_id
     JOIN services s ON s.id = b.service_id
     JOIN artists a ON a.id = b.artist_id
     WHERE b.id = $1`,
    [bookingId]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json(rows[0]);
});

portalRouter.get("/messages", async (req, res) => {
  const messages = await listBookingMessages(req.portal!.bookingId);
  res.json(messages);
});

portalRouter.post("/messages", async (req, res) => {
  const { body, mediaUrl } = req.body as { body?: string; mediaUrl?: string };

  try {
    const message = await createBookingMessage({
      bookingId: req.portal!.bookingId,
      senderRole: "client",
      body,
      mediaUrl,
    });
    res.status(201).json(message);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send message";
    if (message === "A message needs text or an attached photo") {
      res.status(400).json({ error: message });
      return;
    }
    if (message === "Booking not found") {
      res.status(404).json({ error: message });
      return;
    }
    console.error("Portal message error", err);
    res.status(500).json({ error: "Could not send message" });
  }
});
