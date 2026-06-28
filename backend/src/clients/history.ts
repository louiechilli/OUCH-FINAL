import { pool } from "../db";

export type ClientHistoryKind = "client_created" | "booking" | "payment" | "consent" | "booking_event";

export interface ClientHistoryItem {
  kind: ClientHistoryKind;
  occurredAt: string;
  title: string;
  description: string | null;
  bookingId: number | null;
  metadata: Record<string, unknown>;
}

export async function getClientHistory(clientId: number): Promise<ClientHistoryItem[] | null> {
  const { rows: clientRows } = await pool.query<{ created_at: Date }>(
    "SELECT created_at FROM clients WHERE id = $1",
    [clientId]
  );
  if (!clientRows[0]) return null;

  const items: ClientHistoryItem[] = [
    {
      kind: "client_created",
      occurredAt: clientRows[0].created_at.toISOString(),
      title: "Client profile created",
      description: null,
      bookingId: null,
      metadata: {},
    },
  ];

  const { rows: bookings } = await pool.query<{
    id: number;
    status: string;
    starts_at: Date;
    created_at: Date;
    total_amount: string;
    amount_paid: string;
    balance_due: string;
    service_name: string;
    artist_display_name: string;
  }>(
    `SELECT b.id, b.status, b.starts_at, b.created_at, b.total_amount, b.amount_paid, b.balance_due,
            s.name AS service_name, a.display_name AS artist_display_name
     FROM bookings b
     JOIN services s ON s.id = b.service_id
     JOIN artists a ON a.id = b.artist_id
     WHERE b.client_id = $1`,
    [clientId]
  );

  for (const booking of bookings) {
    items.push({
      kind: "booking",
      occurredAt: booking.starts_at.toISOString(),
      title: `Appointment — ${booking.service_name}`,
      description: `With ${booking.artist_display_name}`,
      bookingId: booking.id,
      metadata: {
        status: booking.status,
        totalAmount: Number(booking.total_amount),
        amountPaid: Number(booking.amount_paid),
        balanceDue: Number(booking.balance_due),
        bookedAt: booking.created_at.toISOString(),
      },
    });
  }

  const { rows: payments } = await pool.query<{
    amount: string;
    payment_method: string;
    payment_type: string;
    status: string;
    occurred_at: Date;
    booking_id: number;
    service_name: string;
  }>(
    `SELECT p.amount, p.payment_method, p.payment_type, p.status,
            COALESCE(p.paid_at, p.created_at) AS occurred_at,
            b.id AS booking_id, s.name AS service_name
     FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     JOIN services s ON s.id = b.service_id
     WHERE b.client_id = $1`,
    [clientId]
  );

  for (const payment of payments) {
    items.push({
      kind: "payment",
      occurredAt: payment.occurred_at.toISOString(),
      title: `£${Number(payment.amount).toFixed(2)} ${payment.payment_method} payment`,
      description: `${payment.payment_type.replace(/_/g, " ")} · ${payment.service_name}`,
      bookingId: payment.booking_id,
      metadata: {
        amount: Number(payment.amount),
        paymentMethod: payment.payment_method,
        paymentType: payment.payment_type,
        status: payment.status,
      },
    });
  }

  const { rows: consents } = await pool.query<{
    signed_at: Date;
    booking_id: number;
    template_name: string;
    service_name: string;
  }>(
    `SELECT cs.signed_at, cs.booking_id, t.name AS template_name, s.name AS service_name
     FROM consent_submissions cs
     JOIN bookings b ON b.id = cs.booking_id
     JOIN consent_form_templates t ON t.id = cs.template_id
     JOIN services s ON s.id = b.service_id
     WHERE b.client_id = $1`,
    [clientId]
  );

  for (const consent of consents) {
    items.push({
      kind: "consent",
      occurredAt: consent.signed_at.toISOString(),
      title: `Consent signed — ${consent.template_name}`,
      description: consent.service_name,
      bookingId: consent.booking_id,
      metadata: { templateName: consent.template_name },
    });
  }

  const { rows: bookingEvents } = await pool.query<{
    event_type: string;
    notes: string | null;
    old_value: string | null;
    new_value: string | null;
    created_at: Date;
    booking_id: number;
    service_name: string;
  }>(
    `SELECT be.event_type, be.notes, be.old_value, be.new_value, be.created_at,
            be.booking_id, s.name AS service_name
     FROM booking_events be
     JOIN bookings b ON b.id = be.booking_id
     JOIN services s ON s.id = b.service_id
     WHERE b.client_id = $1
       AND be.event_type NOT IN ('created')`,
    [clientId]
  );

  const eventTitles: Record<string, string> = {
    confirmed: "Booking confirmed",
    cancelled: "Booking cancelled",
    rescheduled: "Booking rescheduled",
    payment_added: "Payment recorded",
    calendar_synced: "Synced to calendar",
    note_added: "Note added",
  };

  for (const event of bookingEvents) {
    const label = eventTitles[event.event_type] ?? event.event_type;
    items.push({
      kind: "booking_event",
      occurredAt: event.created_at.toISOString(),
      title: label,
      description: [event.service_name, event.notes].filter(Boolean).join(" · ") || null,
      bookingId: event.booking_id,
      metadata: {
        eventType: event.event_type,
        oldValue: event.old_value,
        newValue: event.new_value,
      },
    });
  }

  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return items;
}
