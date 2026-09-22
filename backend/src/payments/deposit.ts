import { pool } from "../db";
import { getTerminalProvider } from "../terminals";
import { getDefaultStoredTerminal } from "../terminals/service";
import { generateEnvelopeCode } from "./envelope";
import { listBookingPayments, recordBookingPayment } from "./service";

const TERMINAL_TX_STATUSES = new Set(["SUCCESSFUL", "FAILED", "CANCELLED", "REFUNDED", "CHARGE_BACK"]);

interface BookingDepositRow {
  id: number;
  deposit_amount: string;
  amount_paid: string;
  balance_due: string;
}

async function getBookingForDeposit(bookingId: number): Promise<BookingDepositRow> {
  const { rows } = await pool.query<BookingDepositRow>(
    "SELECT id, deposit_amount, amount_paid, balance_due FROM bookings WHERE id = $1",
    [bookingId]
  );
  if (!rows[0]) throw new Error("Booking not found");
  return rows[0];
}

function depositAmountDue(booking: BookingDepositRow): number {
  const deposit = Number(booking.deposit_amount);
  const paid = Number(booking.amount_paid);
  const balance = Number(booking.balance_due);
  if (deposit <= 0 || balance <= 0) return 0;
  const depositRemaining = Math.max(0, Math.round((deposit - paid) * 100) / 100);
  return Math.min(depositRemaining, balance);
}

export async function collectCashDeposit(bookingId: number, actorUserId: number) {
  const booking = await getBookingForDeposit(bookingId);
  const amount = depositAmountDue(booking);
  if (amount <= 0) {
    throw new Error("No deposit due on this booking");
  }

  const envelopeCode = await generateEnvelopeCode(bookingId);
  const result = await recordBookingPayment({
    bookingId,
    amount,
    paymentMethod: "cash",
    paymentType: "deposit",
    transactionReference: envelopeCode,
    actorUserId,
  });

  return { envelopeCode, amount, payment: result.payment, booking: result.booking };
}

export async function startCardDeposit(bookingId: number) {
  const booking = await getBookingForDeposit(bookingId);
  const amount = depositAmountDue(booking);
  if (amount <= 0) {
    throw new Error("No deposit due on this booking");
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
    `Deposit — booking #${bookingId}`
  );

  return {
    clientTransactionId: checkout.clientTransactionId,
    terminalId: terminal.id,
    amount,
    currency: config.currency,
  };
}

export async function pollCardDeposit(
  bookingId: number,
  clientTransactionId: string,
  actorUserId: number
) {
  const provider = getTerminalProvider();

  const { rows: existingPayments } = await pool.query<{ id: number }>(
    `SELECT id FROM payments
     WHERE booking_id = $1 AND transaction_reference = $2 AND payment_type = 'deposit'`,
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
      const booking = await getBookingForDeposit(bookingId);
      const amount = transaction.amount ?? depositAmountDue(booking);
      const result = await recordBookingPayment({
        bookingId,
        amount,
        paymentMethod: "sumup",
        paymentType: "deposit",
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

export async function getDepositStatus(bookingId: number) {
  const booking = await getBookingForDeposit(bookingId);
  return {
    depositAmount: Number(booking.deposit_amount),
    amountDue: depositAmountDue(booking),
    depositCollected: depositAmountDue(booking) === 0,
  };
}
