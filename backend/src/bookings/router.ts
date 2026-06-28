import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth/middleware";
import { resolveRate } from "./pricing";
import { removeBookingFromCalendar, syncBookingToCalendar } from "./calendarSync";
import { logActivity, diffFields } from "../activity/log";
import { listBookingPayments, recordBookingPayment } from "../payments/service";
import {
  collectCashDeposit,
  getDepositStatus,
  pollCardDeposit,
  startCardDeposit,
} from "../payments/deposit";
import {
  collectCashBalance,
  getBalanceStatus,
  pollCardBalance,
  startCardBalance,
} from "../payments/balance";
import {
  notifyBookingCreated,
  notifyBookingRescheduled,
  notifyBookingStatusChange,
} from "../notifications/service";
import { setupClientPortalForBooking } from "../portal/onBookingCreated";
import { createBookingMessage, listBookingMessages } from "./messages";

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

bookingsRouter.get("/", async (req, res) => {
  const { from, to } = req.query as Record<string, string | undefined>;
  const rawArtistId = req.query.artistId;
  const artistIds = (Array.isArray(rawArtistId) ? rawArtistId : rawArtistId ? [rawArtistId] : [])
    .map((value) => Number(value))
    .filter((value) => !Number.isNaN(value));
  const rawStatus = req.query.status;
  const statuses = (Array.isArray(rawStatus) ? rawStatus : rawStatus ? [rawStatus] : []).filter(Boolean);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (artistIds.length === 1) {
    params.push(artistIds[0]);
    conditions.push(`artist_id = $${params.length}`);
  } else if (artistIds.length > 1) {
    params.push(artistIds);
    conditions.push(`artist_id = ANY($${params.length})`);
  }
  if (statuses.length === 1) {
    params.push(statuses[0]);
    conditions.push(`status = $${params.length}`);
  } else if (statuses.length > 1) {
    params.push(statuses);
    conditions.push(`status = ANY($${params.length})`);
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
  // Joined so the dashboard can render a name instead of three foreign keys
  // without an N+1 fetch per row.
  const { rows } = await pool.query(
    `SELECT b.*,
            c.first_name AS client_first_name, c.last_name AS client_last_name,
            c.email AS client_email, c.phone AS client_phone, c.date_of_birth AS client_date_of_birth,
            s.name AS service_name, s.requires_consent_form_id,
            a.display_name AS artist_display_name,
            EXISTS(SELECT 1 FROM consent_submissions cs WHERE cs.booking_id = b.id) AS consent_signed
     FROM bookings b
     JOIN clients c ON c.id = b.client_id
     JOIN services s ON s.id = b.service_id
     JOIN artists a ON a.id = b.artist_id
     ${where}
     ORDER BY b.starts_at ASC`,
    params
  );
  res.json(rows);
});

bookingsRouter.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*,
            c.first_name AS client_first_name, c.last_name AS client_last_name,
            c.email AS client_email, c.phone AS client_phone, c.date_of_birth AS client_date_of_birth,
            c.notes AS client_notes_internal,
            s.name AS service_name, s.requires_consent_form_id,
            a.display_name AS artist_display_name,
            EXISTS(SELECT 1 FROM consent_submissions cs WHERE cs.booking_id = b.id) AS consent_signed
     FROM bookings b
     JOIN clients c ON c.id = b.client_id
     JOIN services s ON s.id = b.service_id
     JOIN artists a ON a.id = b.artist_id
     WHERE b.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  res.json(rows[0]);
});

bookingsRouter.get("/:id/payments", async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }

  const { rows: bookingRows } = await pool.query("SELECT id FROM bookings WHERE id = $1", [bookingId]);
  if (!bookingRows[0]) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const payments = await listBookingPayments(bookingId);
  res.json(payments);
});

bookingsRouter.post("/:id/payments", async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }

  const { amount, paymentMethod, paymentType, transactionReference } = req.body as {
    amount?: unknown;
    paymentMethod?: unknown;
    paymentType?: unknown;
    transactionReference?: string | null;
  };

  try {
    const result = await recordBookingPayment({
      bookingId,
      amount,
      paymentMethod,
      paymentType,
      transactionReference,
      actorUserId: req.user!.id,
    });
    res.status(201).json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "Booking not found") {
      res.status(404).json({ error: message });
      return;
    }
    if (
      message.startsWith("amount ") ||
      message.startsWith("paymentMethod ") ||
      message.startsWith("paymentType ") ||
      message.includes("cannot exceed")
    ) {
      res.status(400).json({ error: message });
      return;
    }
    console.error(`Failed to record payment on booking ${bookingId}`, err);
    res.status(500).json({ error: "Could not record payment" });
  }
});

function handleDepositError(res: import("express").Response, err: unknown) {
  const message = err instanceof Error ? err.message : "Deposit error";
  if (message === "Booking not found") {
    res.status(404).json({ error: message });
    return;
  }
  if (
    message === "No deposit due on this booking" ||
    message === "No balance due on this booking" ||
    message.startsWith("No default card terminal") ||
    message === "SumUp is not configured" ||
    message === "Payment amount cannot exceed the balance due"
  ) {
    res.status(400).json({ error: message });
    return;
  }
  console.error("Deposit error", err);
  res.status(502).json({ error: message });
}

bookingsRouter.get("/:id/deposit", async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  try {
    res.json(await getDepositStatus(bookingId));
  } catch (err) {
    handleDepositError(res, err);
  }
});

bookingsRouter.post("/:id/deposit/cash", async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  try {
    const result = await collectCashDeposit(bookingId, req.user!.id);
    res.status(201).json(result);
  } catch (err) {
    handleDepositError(res, err);
  }
});

bookingsRouter.post("/:id/deposit/card", async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  try {
    const result = await startCardDeposit(bookingId);
    res.status(201).json(result);
  } catch (err) {
    handleDepositError(res, err);
  }
});

bookingsRouter.get("/:id/deposit/card/:clientTransactionId", async (req, res) => {
  const bookingId = Number(req.params.id);
  const { clientTransactionId } = req.params;
  if (!Number.isFinite(bookingId) || !clientTransactionId?.trim()) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    const result = await pollCardDeposit(bookingId, clientTransactionId, req.user!.id);
    res.json(result);
  } catch (err) {
    handleDepositError(res, err);
  }
});

bookingsRouter.get("/:id/balance", async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  try {
    res.json(await getBalanceStatus(bookingId));
  } catch (err) {
    handleDepositError(res, err);
  }
});

bookingsRouter.post("/:id/balance/cash", async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  try {
    const result = await collectCashBalance(bookingId, req.user!.id);
    res.status(201).json(result);
  } catch (err) {
    handleDepositError(res, err);
  }
});

bookingsRouter.post("/:id/balance/card", async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  try {
    const result = await startCardBalance(bookingId);
    res.status(201).json(result);
  } catch (err) {
    handleDepositError(res, err);
  }
});

bookingsRouter.get("/:id/balance/card/:clientTransactionId", async (req, res) => {
  const bookingId = Number(req.params.id);
  const { clientTransactionId } = req.params;
  if (!Number.isFinite(bookingId) || !clientTransactionId?.trim()) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    const result = await pollCardBalance(bookingId, clientTransactionId, req.user!.id);
    res.json(result);
  } catch (err) {
    handleDepositError(res, err);
  }
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

  let depositAmount = rate.depositAmount;
  let total = subtotal;
  let bookingSubtotal = subtotal;

  // Consults or fixed-fee services may have no hourly charge but still take a deposit.
  if (total <= 0 && depositAmount > 0) {
    total = depositAmount;
    bookingSubtotal = depositAmount;
  } else if (depositAmount > total) {
    depositAmount = total;
  }

  const balanceDue = total;

  const { rows } = await pool.query(
    `INSERT INTO bookings (
       artist_id, client_id, service_id, status, source, starts_at, ends_at,
       duration_minutes, duration_hours, hourly_rate_snapshot, min_hours_snapshot,
       subtotal_amount, deposit_amount, total_amount, amount_paid, balance_due,
       client_notes, internal_notes
     ) VALUES ($1,$2,$3,'booked',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$14,$15,$16)
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
      bookingSubtotal,
      depositAmount,
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
  await logActivity({
    entityType: "booking",
    entityId: booking.id,
    eventType: "created",
    actorUserId: req.user!.id,
    description: `Booking #${booking.id} created`,
    metadata: { artistId: booking.artist_id, clientId: booking.client_id, serviceId: booking.service_id },
  });

  void notifyBookingCreated(booking.id, req.user!.id).catch((err) =>
    console.error(`Failed to create booking notification for #${booking.id}`, err)
  );

  void setupClientPortalForBooking(booking.id).catch((err) =>
    console.error(`Failed to set up client portal for booking #${booking.id}`, err)
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

  const { startsAt, endsAt, status, clientNotes, internalNotes, cancellationReason } = req.body as Record<
    string,
    unknown
  >;

  const updates: string[] = [];
  const params: unknown[] = [];
  let projectedBalanceDue = Number(existing.balance_due);

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
    projectedBalanceDue = balanceDue;

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
    const allowed = ["booked", "done", "cancelled"];
    if (!allowed.includes(status as string)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    // Server-side guardrail — the frontend already hides/disables "mark
    // done" while a balance is outstanding, but that's a UX nicety, not a
    // guarantee. This is the actual enforcement: no client, bug, or direct
    // API call can complete a job with money still owed.
    if (status === "done" && existing.status !== "done" && projectedBalanceDue > 0) {
      res.status(409).json({
        error: `Cannot complete this booking — £${projectedBalanceDue.toFixed(2)} is still outstanding. Take payment first.`,
      });
      return;
    }

    params.push(status);
    updates.push(`status = $${params.length}`);
    if (status === "cancelled") {
      updates.push("cancelled_at = now()");
    }
  }
  if (cancellationReason !== undefined) {
    const reason =
      typeof cancellationReason === "string" && cancellationReason.trim()
        ? cancellationReason.trim()
        : null;
    params.push(reason);
    updates.push(`cancellation_reason = $${params.length}`);
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
    const cancelNote =
      typeof cancellationReason === "string" && cancellationReason.trim()
        ? cancellationReason.trim()
        : null;
    await pool.query(
      `INSERT INTO booking_events (booking_id, user_id, event_type, notes) VALUES ($1, $2, 'cancelled', $3)`,
      [bookingId, req.user!.id, cancelNote]
    );
    await logActivity({
      entityType: "booking",
      entityId: bookingId,
      eventType: "cancelled",
      actorUserId: req.user!.id,
      description: `Booking #${bookingId} cancelled`,
    });
    void notifyBookingStatusChange(bookingId, "cancelled", req.user!.id).catch((err) =>
      console.error(`Failed to create cancellation notification for #${bookingId}`, err)
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
      await logActivity({
        entityType: "booking",
        entityId: bookingId,
        eventType: "rescheduled",
        actorUserId: req.user!.id,
        description: `Booking #${bookingId} rescheduled`,
        changes: diffFields(existing, updated, ["starts_at", "ends_at"]),
      });
      void notifyBookingRescheduled(bookingId, req.user!.id, updated.starts_at).catch((err) =>
        console.error(`Failed to create reschedule notification for #${bookingId}`, err)
      );
    } else {
      await logActivity({
        entityType: "booking",
        entityId: bookingId,
        eventType: "updated",
        actorUserId: req.user!.id,
        description: `Booking #${bookingId} updated`,
        changes: diffFields(existing, updated, ["status", "client_notes", "internal_notes"]),
      });
      if (status && status !== existing.status) {
        void notifyBookingStatusChange(bookingId, status as string, req.user!.id).catch((err) =>
          console.error(`Failed to create status notification for #${bookingId}`, err)
        );
      }
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
  await logActivity({
    entityType: "booking",
    entityId: bookingId,
    eventType: "cancelled",
    actorUserId: req.user!.id,
    description: `Booking #${bookingId} cancelled`,
  });
  void notifyBookingStatusChange(bookingId, "cancelled", req.user!.id).catch((err) =>
    console.error(`Failed to create cancellation notification for #${bookingId}`, err)
  );
  await removeBookingFromCalendar(bookingId).catch((err) =>
    console.error(`Failed to remove booking ${bookingId} from Google Calendar`, err)
  );

  res.json({ status: "cancelled" });
});

bookingsRouter.get("/:id/messages", async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  const messages = await listBookingMessages(bookingId);
  res.json(messages);
});

bookingsRouter.post("/:id/messages", async (req, res) => {
  const bookingId = Number(req.params.id);
  const { body, mediaUrl } = req.body as { body?: string; mediaUrl?: string };

  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }

  try {
    const message = await createBookingMessage({
      bookingId,
      senderRole: "artist",
      senderUserId: req.user!.id,
      body,
      mediaUrl,
      actorUserId: req.user!.id,
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
    console.error("Booking message error", err);
    res.status(500).json({ error: "Could not send message" });
  }
});
