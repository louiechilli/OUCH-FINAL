import type { PoolClient } from "pg";
import { pool } from "../db";
import { logActivity } from "../activity/log";
import { notifyPaymentReceived } from "../notifications/service";

export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "stripe", "sumup"] as const;
export const PAYMENT_TYPES = ["deposit", "balance", "full_payment", "refund"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentType = (typeof PAYMENT_TYPES)[number];

/** Cash and in-studio bank transfers settle immediately — no external provider. */
const IMMEDIATE_METHODS = new Set<PaymentMethod>(["cash", "bank_transfer"]);

interface BookingRow {
  id: number;
  client_id: number;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  deposit_amount: string;
}

export interface PaymentRow {
  id: number;
  booking_id: number;
  client_id: number;
  amount: string;
  payment_method: PaymentMethod;
  payment_type: PaymentType;
  status: "pending" | "completed" | "failed" | "refunded";
  transaction_reference: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function parseAmount(value: unknown): number | "invalid" {
  if (value === undefined || value === null || value === "") return "invalid";
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "invalid";
  return Math.round(num * 100) / 100;
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && PAYMENT_METHODS.includes(value as PaymentMethod);
}

function isPaymentType(value: unknown): value is PaymentType {
  return typeof value === "string" && PAYMENT_TYPES.includes(value as PaymentType);
}

function inferPaymentType(amount: number, booking: BookingRow): PaymentType {
  const total = Number(booking.total_amount);
  const paid = Number(booking.amount_paid);
  const deposit = Number(booking.deposit_amount);

  if (paid === 0 && amount >= total) return "full_payment";
  if (paid === 0 && deposit > 0 && amount <= deposit) return "deposit";
  return "balance";
}

function toPaymentResponse(row: PaymentRow) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    clientId: row.client_id,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    paymentType: row.payment_type,
    status: row.status,
    transactionReference: row.transaction_reference,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function applyCompletedPayment(
  client: PoolClient,
  booking: BookingRow,
  amount: number,
  paymentType: PaymentType
) {
  const total = Number(booking.total_amount);
  const paid = Number(booking.amount_paid);
  const balance = Number(booking.balance_due);

  if (paymentType === "refund") {
    if (amount > paid) {
      throw new Error("Refund cannot exceed amount already paid");
    }
    const nextPaid = Math.round((paid - amount) * 100) / 100;
    const nextBalance = Math.round((total - nextPaid) * 100) / 100;
    await client.query(
      `UPDATE bookings
       SET amount_paid = $1, balance_due = $2, updated_at = now()
       WHERE id = $3`,
      [nextPaid, nextBalance, booking.id]
    );
    return;
  }

  if (amount > balance) {
    throw new Error("Payment amount cannot exceed the balance due");
  }

  const nextPaid = Math.round((paid + amount) * 100) / 100;
  const nextBalance = Math.round((total - nextPaid) * 100) / 100;
  await client.query(
    `UPDATE bookings
     SET amount_paid = $1, balance_due = $2, updated_at = now()
     WHERE id = $3`,
    [nextPaid, nextBalance, booking.id]
  );
}

export async function listBookingPayments(bookingId: number) {
  const { rows } = await pool.query<PaymentRow>(
    `SELECT id, booking_id, client_id, amount, payment_method, payment_type, status,
            transaction_reference, paid_at, created_at, updated_at
     FROM payments
     WHERE booking_id = $1
     ORDER BY created_at ASC`,
    [bookingId]
  );
  return rows.map(toPaymentResponse);
}

export async function recordBookingPayment(input: {
  bookingId: number;
  amount: unknown;
  paymentMethod: unknown;
  paymentType?: unknown;
  transactionReference?: string | null;
  actorUserId: number;
  /** When true, card/sumup payments settle immediately (e.g. terminal confirmed). */
  forceCompleted?: boolean;
}) {
  const amount = parseAmount(input.amount);
  if (amount === "invalid") {
    throw new Error("amount must be greater than 0");
  }

  if (!isPaymentMethod(input.paymentMethod)) {
    throw new Error(`paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`);
  }

  const paymentMethod = input.paymentMethod;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: bookingRows } = await client.query<BookingRow>(
      `SELECT id, client_id, total_amount, amount_paid, balance_due, deposit_amount
       FROM bookings
       WHERE id = $1
       FOR UPDATE`,
      [input.bookingId]
    );
    const booking = bookingRows[0];
    if (!booking) {
      throw new Error("Booking not found");
    }

    let paymentType: PaymentType;
    if (input.paymentType !== undefined && input.paymentType !== null && input.paymentType !== "") {
      if (!isPaymentType(input.paymentType)) {
        throw new Error(`paymentType must be one of: ${PAYMENT_TYPES.join(", ")}`);
      }
      paymentType = input.paymentType;
    } else {
      paymentType = inferPaymentType(amount, booking);
    }

    const status =
      IMMEDIATE_METHODS.has(paymentMethod) || input.forceCompleted ? "completed" : "pending";
    const paidAt = status === "completed" ? new Date() : null;
    const transactionReference = input.transactionReference?.trim() || null;

    if (status === "completed") {
      await applyCompletedPayment(client, booking, amount, paymentType);
    }

    const { rows: paymentRows } = await client.query<PaymentRow>(
      `INSERT INTO payments (
         booking_id, client_id, amount, payment_method, payment_type, status,
         transaction_reference, paid_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, booking_id, client_id, amount, payment_method, payment_type, status,
                 transaction_reference, paid_at, created_at, updated_at`,
      [
        booking.id,
        booking.client_id,
        amount,
        paymentMethod,
        paymentType,
        status,
        transactionReference,
        paidAt,
      ]
    );

    await client.query(
      `INSERT INTO booking_events (booking_id, user_id, event_type, new_value, notes)
       VALUES ($1, $2, 'payment_added', $3, $4)`,
      [
        booking.id,
        input.actorUserId,
        String(amount),
        `${paymentMethod} ${paymentType}${transactionReference ? ` (${transactionReference})` : ""}`,
      ]
    );

    await client.query("COMMIT");

    const payment = paymentRows[0];
    await logActivity({
      entityType: "payment",
      entityId: payment.id,
      eventType: "created",
      actorUserId: input.actorUserId,
      description: `£${amount} ${paymentMethod} payment recorded on booking #${booking.id}`,
      metadata: {
        bookingId: booking.id,
        paymentMethod,
        paymentType,
        status,
      },
    });

    if (status === "completed") {
      void notifyPaymentReceived(
        booking.id,
        amount,
        paymentMethod,
        paymentType,
        input.actorUserId
      ).catch((err) =>
        console.error(`Failed to create payment notification for booking #${booking.id}`, err)
      );
    }

    const { rows: updatedBookingRows } = await pool.query(
      "SELECT * FROM bookings WHERE id = $1",
      [booking.id]
    );

    return {
      payment: toPaymentResponse(payment),
      booking: updatedBookingRows[0],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
