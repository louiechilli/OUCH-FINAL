import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth/middleware";
import { resolveRate } from "./pricing";
import { removeBookingFromCalendar, syncBookingToCalendar } from "./calendarSync";

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

bookingsRouter.get("/", async (req, res) => {
  const { artistId, status, from, to } = req.query as Record<string, string | undefined>;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (artistId) {
    params.push(Number(artistId));
    conditions.push(`artist_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`ends_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`starts_at <= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM bookings ${where} ORDER BY starts_at ASC`,
    params
  );
  res.json(rows);
});

bookingsRouter.get("/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM bookings WHERE id = $1", [req.params.id]);
  if (!rows[0]) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  res.json(rows[0]);
});

bookingsRouter.post("/", async (req, res) => {
  const {
    artistId,
    clientId,
    serviceId,
    startsAt,
    endsAt,
    source = "admin",
    clientNotes,
    internalNotes,
  } = req.body as Record<string, unknown>;

  if (!artistId || !clientId || !serviceId || !startsAt || !endsAt) {
    res.status(400).json({ error: "artistId, clientId, serviceId, startsAt and endsAt are required" });
    return;
  }

  const starts = new Date(startsAt as string);
  const ends = new Date(endsAt as string);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
    res.status(400).json({ error: "Invalid startsAt/endsAt" });
    return;
  }

  let rate;
  try {
    rate = await resolveRate(Number(artistId), Number(serviceId));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  const durationMinutes = Math.round((ends.getTime() - starts.getTime()) / 60000);
  const durationHours = durationMinutes / 60;
  const subtotal = Math.round(rate.hourlyRate * durationHours * 100) / 100;
  const total = subtotal;
  const balanceDue = total;

  const { rows } = await pool.query(
    `INSERT INTO bookings (
       artist_id, client_id, service_id, status, source, starts_at, ends_at,
       duration_minutes, duration_hours, hourly_rate_snapshot, min_hours_snapshot,
       subtotal_amount, deposit_amount, total_amount, amount_paid, balance_due,
       client_notes, internal_notes
     ) VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$14,$15,$16)
     RETURNING *`,
    [
      artistId,
      clientId,
      serviceId,
      source,
      starts,
      ends,
      durationMinutes,
      durationHours,
      rate.hourlyRate,
      rate.minHours,
      subtotal,
      rate.depositAmount,
      total,
      balanceDue,
      clientNotes ?? null,
      internalNotes ?? null,
    ]
  );
  const booking = rows[0];

  await pool.query(
    `INSERT INTO booking_events (booking_id, user_id, event_type) VALUES ($1, $2, 'created')`,
    [booking.id, req.user!.id]
  );

  try {
    await syncBookingToCalendar(booking.id);
  } catch (err) {
    // The booking is the source of record locally regardless — surface the
    // calendar failure but don't roll back a real, taken booking over it.
    console.error(`Failed to push booking ${booking.id} to Google Calendar`, err);
    res.status(201).json({ ...booking, calendarSyncError: (err as Error).message });
    return;
  }

  const { rows: refreshed } = await pool.query("SELECT * FROM bookings WHERE id = $1", [booking.id]);
  res.status(201).json(refreshed[0]);
});

bookingsRouter.patch("/:id", async (req, res) => {
  const bookingId = Number(req.params.id);
  const { rows } = await pool.query("SELECT * FROM bookings WHERE id = $1", [bookingId]);
  const existing = rows[0];
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const { startsAt, endsAt, status, clientNotes, internalNotes } = req.body as Record<
    string,
    unknown
  >;

  const updates: string[] = [];
  const params: unknown[] = [];

  // Deliberately recompute pricing here, unlike the Google-Calendar-driven
  // sync path: an admin editing duration through the API is an intentional
  // change to the booking, not silent rate drift, so the snapshot rate is
  // re-applied to the new duration.
  if (startsAt && endsAt) {
    const starts = new Date(startsAt as string);
    const ends = new Date(endsAt as string);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
      res.status(400).json({ error: "Invalid startsAt/endsAt" });
      return;
    }
    const durationMinutes = Math.round((ends.getTime() - starts.getTime()) / 60000);
    const durationHours = durationMinutes / 60;
    const subtotal = Math.round(Number(existing.hourly_rate_snapshot) * durationHours * 100) / 100;
    const balanceDue = Math.round((subtotal - Number(existing.amount_paid)) * 100) / 100;

    params.push(starts, ends, durationMinutes, durationHours, subtotal, subtotal, balanceDue);
    updates.push(
      `starts_at = $${params.length - 6}`,
      `ends_at = $${params.length - 5}`,
      `duration_minutes = $${params.length - 4}`,
      `duration_hours = $${params.length - 3}`,
      `subtotal_amount = $${params.length - 2}`,
      `total_amount = $${params.length - 1}`,
      `balance_due = $${params.length}`
    );
  }

  if (status) {
    params.push(status);
    updates.push(`status = $${params.length}`);
    if (status === "cancelled") {
      updates.push("cancelled_at = now()");
    }
  }
  if (clientNotes !== undefined) {
    params.push(clientNotes);
    updates.push(`client_notes = $${params.length}`);
  }
  if (internalNotes !== undefined) {
    params.push(internalNotes);
    updates.push(`internal_notes = $${params.length}`);
  }

  if (updates.length === 0) {
    res.json(existing);
    return;
  }

  params.push(bookingId);
  const { rows: updatedRows } = await pool.query(
    `UPDATE bookings SET ${updates.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params
  );
  const updated = updatedRows[0];

  if (status === "cancelled" && existing.status !== "cancelled") {
    await pool.query(
      `INSERT INTO booking_events (booking_id, user_id, event_type) VALUES ($1, $2, 'cancelled')`,
      [bookingId, req.user!.id]
    );
    await removeBookingFromCalendar(bookingId).catch((err) =>
      console.error(`Failed to remove booking ${bookingId} from Google Calendar`, err)
    );
  } else {
    if (startsAt && endsAt) {
      await pool.query(
        `INSERT INTO booking_events (booking_id, user_id, event_type, old_value, new_value)
         VALUES ($1, $2, 'rescheduled', $3, $4)`,
        [bookingId, req.user!.id, existing.starts_at, updated.starts_at]
      );
    }
    await syncBookingToCalendar(bookingId).catch((err) =>
      console.error(`Failed to push booking ${bookingId} update to Google Calendar`, err)
    );
  }

  const { rows: final } = await pool.query("SELECT * FROM bookings WHERE id = $1", [bookingId]);
  res.json(final[0]);
});

bookingsRouter.delete("/:id", async (req, res) => {
  const bookingId = Number(req.params.id);
  const { rows } = await pool.query("SELECT * FROM bookings WHERE id = $1", [bookingId]);
  if (!rows[0]) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  await pool.query(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1",
    [bookingId]
  );
  await pool.query(
    `INSERT INTO booking_events (booking_id, user_id, event_type) VALUES ($1, $2, 'cancelled')`,
    [bookingId, req.user!.id]
  );
  await removeBookingFromCalendar(bookingId).catch((err) =>
    console.error(`Failed to remove booking ${bookingId} from Google Calendar`, err)
  );

  res.json({ status: "cancelled" });
});
