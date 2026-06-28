import { pool } from "../db";
import { getTerminalProvider } from "../terminals";
import { getDefaultStoredTerminal } from "../terminals/service";
import { generateEnvelopeCode } from "./envelope";
import { listBookingPayments, recordBookingPayment } from "./service";

const TERMINAL_TX_STATUSES = new Set(["SUCCESSFUL", "FAILED", "CANCELLED", "REFUNDED", "CHARGE_BACK"]);

interface BookingBalanceRow {
  id: number;
  balance_due: string;
}

async function getBookingForBalance(bookingId: number): Promise<BookingBalanceRow> {
  const { rows } = await pool.query<BookingBalanceRow>(
    "SELECT id, balance_due FROM bookings WHERE id = $1",
    [bookingId]
  );
  if (!rows[0]) throw new Error("Booking not found");
  return rows[0];
}

function balanceAmountDue(booking: BookingBalanceRow): number {
  return Math.round(Number(booking.balance_due) * 100) / 100;
}

export async function getBalanceStatus(bookingId: number) {
  const booking = await getBookingForBalance(bookingId);
  const amountDue = balanceAmountDue(booking);
  return {
    balanceDue: amountDue,
    hasBalanceDue: amountDue > 0,
  };
}

export async function collectCashBalance(bookingId: number, actorUserId: number) {
  const booking = await getBookingForBalance(bookingId);
  const amount = balanceAmountDue(booking);
  if (amount <= 0) {
    throw new Error("No balance due on this booking");
  }

  const envelopeCode = await generateEnvelopeCode(bookingId);
  const result = await recordBookingPayment({
    bookingId,
    amount,
    paymentMethod: "cash",
    paymentType: "balance",
    transactionReference: envelopeCode,
    actorUserId,
  });

  return { envelopeCode, amount, payment: result.payment, booking: result.booking };
}

export async function startCardBalance(bookingId: number) {
  const booking = await getBookingForBalance(bookingId);
  const amount = balanceAmountDue(booking);
  if (amount <= 0) {
    throw new Error("No balance due on this booking");
  }

  const terminal = await getDefaultStoredTerminal();
  if (!terminal) {
    throw new Error(
      "No default card terminal configured — pair a SumUp reader in Payment terminal settings"
    );
  }

  const provider = getTerminalProvider();
  const config = provider.getConfigStatus();
  if (!config.configured) {
    throw new Error("SumUp is not configured");
  }

  const amountMinorUnits = Math.round(amount * 100);
  const checkout = await provider.createCheckout(
    terminal.externalId,
    amountMinorUnits,
    `Balance — booking #${bookingId}`
  );

  return {
    clientTransactionId: checkout.clientTransactionId,
    terminalId: terminal.id,
    amount,
    currency: config.currency,
  };
}

export async function pollCardBalance(
  bookingId: number,
  clientTransactionId: string,
  actorUserId: number
) {
  const provider = getTerminalProvider();

  const { rows: existingPayments } = await pool.query<{ id: number }>(
    `SELECT id FROM payments
     WHERE booking_id = $1 AND transaction_reference = $2 AND payment_type IN ('balance', 'full_payment')`,
    [bookingId, clientTransactionId]
  );

  const transaction = await provider.getTransaction(clientTransactionId);

  const terminal = await getDefaultStoredTerminal();
  const device = terminal
    ? await provider.getReaderStatus(terminal.externalId).catch(() => null)
    : null;

  if (existingPayments[0]) {
    const payments = await listBookingPayments(bookingId);
    const payment = payments.find((p) => p.transactionReference === clientTransactionId) ?? null;
    return { pending: false, transaction, device, payment };
  }

  if (transaction && TERMINAL_TX_STATUSES.has(transaction.status.toUpperCase())) {
    if (transaction.status.toUpperCase() === "SUCCESSFUL") {
      const booking = await getBookingForBalance(bookingId);
      const amount = transaction.amount ?? balanceAmountDue(booking);
      const result = await recordBookingPayment({
        bookingId,
        amount,
        paymentMethod: "sumup",
        paymentType: "balance",
        transactionReference: clientTransactionId,
        actorUserId,
        forceCompleted: true,
      });
      return { pending: false, transaction, device, payment: result.payment };
    }
    return { pending: false, transaction, device, payment: null };
  }

  return { pending: true, transaction, device, payment: null };
}
