import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { STUDIO_TIMEZONE } from "../lib/timezone";
import {
  formatBookingDayLabel,
  formatBookingEndTime,
  formatBookingStartTime,
  getBookingTiming,
} from "../lib/bookingTiming";
import { useNow } from "../hooks/useNow";
import BookingActionsBar from "../components/booking/BookingActionsBar";
import BookingStatusPill from "../components/BookingStatusPill";
import { useBookingActionModals } from "../components/booking/useBookingActionModals";
import type { BookingStatus } from "../lib/bookingStatus";

interface BookingDetail {
  id: number;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  duration_hours: string;
  subtotal_amount: string;
  deposit_amount: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  client_notes: string | null;
  internal_notes: string | null;
  client_first_name: string;
  client_last_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_date_of_birth: string | null;
  service_name: string;
  requires_consent_form_id: number | null;
  consent_signed: boolean;
  artist_display_name: string;
  cancellation_reason: string | null;
}

interface ConsentSubmission {
  id: number;
  template_name: string;
  signed_at: string;
  client_signature: string;
  artist_signature: string | null;
}

interface BookingMessage {
  id: number;
  sender_role: "artist" | "client";
  sender_name: string | null;
  body: string | null;
  media_url: string | null;
  created_at: string;
}

interface BookingPayment {
  id: number;
  amount: number;
  paymentMethod: string;
  paymentType: string;
  status: string;
  transactionReference: string | null;
  paidAt: string | null;
}

interface BookingDetailPageProps {
  bookingId: number;
  onBack: () => void;
  onChanged: () => void;
  onSignConsent: () => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function BookingDetailPage({ bookingId, onBack, onChanged, onSignConsent }: BookingDetailPageProps) {
  const { fetchWithAuth } = useAuth();
  const now = useNow();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [submissions, setSubmissions] = useState<ConsentSubmission[] | null>(null);
  const [messages, setMessages] = useState<BookingMessage[] | null>(null);
  const [payments, setPayments] = useState<BookingPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [pendingMedia, setPendingMedia] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadBooking = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/bookings/${bookingId}`);
      if (!res.ok) throw new Error("Could not load this booking");
      setBooking(await res.json());
    } catch (err) {
      setError((err as Error).message);
    }
  }, [fetchWithAuth, bookingId]);

  const loadSubmissions = useCallback(async () => {
    const res = await fetchWithAuth(`/api/consent/submissions?bookingId=${bookingId}`);
    setSubmissions(res.ok ? await res.json() : []);
  }, [fetchWithAuth, bookingId]);

  const loadMessages = useCallback(async () => {
    const res = await fetchWithAuth(`/api/bookings/${bookingId}/messages`);
    setMessages(res.ok ? await res.json() : []);
  }, [fetchWithAuth, bookingId]);

  const loadPayments = useCallback(async () => {
    const res = await fetchWithAuth(`/api/bookings/${bookingId}/payments`);
    setPayments(res.ok ? await res.json() : []);
  }, [fetchWithAuth, bookingId]);

  useEffect(() => {
    void loadBooking();
    void loadSubmissions();
    void loadMessages();
    void loadPayments();
  }, [loadBooking, loadSubmissions, loadMessages, loadPayments]);

  const bookingActions = useBookingActionModals({
    fetchWithAuth,
    onChanged: () => {
      void loadBooking();
      onChanged();
    },
  });

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingMedia(await fileToDataUrl(file));
  };

  const sendMessage = async () => {
    if (!messageText.trim() && !pendingMedia) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/bookings/${bookingId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: messageText.trim() || undefined, mediaUrl: pendingMedia ?? undefined }),
      });
      if (!res.ok) throw new Error("Could not send message");
      setMessageText("");
      setPendingMedia(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadMessages();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (!booking) {
    return (
      <div className="detail-screen detail-screen--booking">
        <header className="detail-screen__toolbar">
          <button type="button" className="detail-screen__back" onClick={onBack}>
            ← Back
          </button>
          <div className="detail-screen__title">
            <h2>Booking</h2>
          </div>
        </header>
        <div className="detail-screen__body detail-screen__body--centered">
          {error ? <p className="wizard-error">{error}</p> : <p className="wizard-loading">Loading…</p>}
        </div>
      </div>
    );
  }

  const timing = getBookingTiming(booking.starts_at, booking.ends_at, booking.status, now);
  const balanceDue = Number(booking.balance_due);
  const totalAmount = Number(booking.total_amount);
  const amountPaid = Number(booking.amount_paid);
  const clientName = `${booking.client_first_name} ${booking.client_last_name}`;
  const messageCount = messages?.length ?? 0;
  const needsConsent = Boolean(booking.requires_consent_form_id && !booking.consent_signed);

  const railClass = [
    "detail-session-rail",
    timing.isOverdue ? "detail-session-rail--overdue" : "",
    timing.variant === "in_progress" ? "detail-session-rail--live" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const bodyClass = [
    "detail-screen__body",
    "detail-screen__body--booking",
    chatOpen ? "detail-screen__body--chat-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="detail-screen detail-screen--booking">
      {bookingActions.modals}

      <header className="detail-screen__toolbar detail-screen__toolbar--booking">
        <button type="button" className="detail-screen__back" onClick={onBack}>
          ← Back
        </button>
        <div className="detail-screen__title">
          <h2>{clientName}</h2>
          <p>
            #{booking.id} · {booking.service_name}
          </p>
        </div>
        <button
          type="button"
          className={`detail-screen__chat-toggle${chatOpen ? " detail-screen__chat-toggle--active" : ""}`}
          onClick={() => setChatOpen((open) => !open)}
          aria-expanded={chatOpen}
        >
          {chatOpen ? "Hide chat" : "Media & chat"}
          {messageCount > 0 ? <span className="detail-screen__chat-badge">{messageCount}</span> : null}
        </button>
      </header>

      {error && <p className="detail-screen__alert wizard-error">{error}</p>}

      <div className={bodyClass}>
        <aside className={railClass}>
          <div className="detail-session-rail__card">
            <div className="detail-session-rail__time-block">
              <span className="detail-session-rail__date">{formatBookingDayLabel(booking.starts_at)}</span>
              <span className="detail-session-rail__start">{formatBookingStartTime(booking.starts_at)}</span>
              <span className="detail-session-rail__end">{formatBookingEndTime(booking.ends_at)}</span>
              <span className="detail-session-rail__duration">{booking.duration_hours} hr</span>
            </div>

            <div className="detail-session-rail__meta">
              <BookingStatusPill status={booking.status} />
              {timing.isOverdue && <span className="pill pill--overdue">Overdue</span>}
            </div>

            {timing.timingLabel && (
              <p className={`detail-session-rail__timing detail-session-rail__timing--${timing.variant}`}>
                {timing.timingLabel}
              </p>
            )}

            <ul className="detail-session-rail__quick">
              <li className={balanceDue > 0 ? "detail-session-rail__quick-item--warn" : "detail-session-rail__quick-item--ok"}>
                <span>Balance due</span>
                <strong>£{balanceDue.toFixed(2)}</strong>
              </li>
              <li>
                <span>Paid</span>
                <strong>£{amountPaid.toFixed(2)}</strong>
              </li>
              <li>
                <span>Session total</span>
                <strong>£{totalAmount.toFixed(2)}</strong>
              </li>
              {booking.requires_consent_form_id && (
                <li className={needsConsent ? "detail-session-rail__quick-item--warn" : "detail-session-rail__quick-item--ok"}>
                  <span>Consent</span>
                  <strong>{booking.consent_signed ? "Signed" : "Required"}</strong>
                </li>
              )}
            </ul>

            <div className="detail-session-rail__contact">
              <span className="detail-session-rail__contact-label">Quick contact</span>
              {booking.client_phone ? (
                <a className="detail-session-rail__contact-link" href={`tel:${booking.client_phone}`}>
                  {booking.client_phone}
                </a>
              ) : (
                <span className="detail-session-rail__contact-muted">No phone</span>
              )}
              {booking.client_email ? (
                <a className="detail-session-rail__contact-link" href={`mailto:${booking.client_email}`}>
                  {booking.client_email}
                </a>
              ) : null}
            </div>

            <p className="detail-session-rail__artist">
              {booking.artist_display_name}
            </p>

            {booking.status === "cancelled" && booking.cancellation_reason && (
              <p className="detail-session-rail__cancel">{booking.cancellation_reason}</p>
            )}

            <div className="detail-session-rail__actions">
              <BookingActionsBar
                status={booking.status}
                onComplete={() => bookingActions.openComplete(booking)}
                onReschedule={() => bookingActions.openReschedule(booking.id)}
                onCancel={() => bookingActions.openCancel(booking)}
              />
            </div>
          </div>
        </aside>

        <div className="detail-screen__main detail-screen__main--booking">
          <div className="detail-tiles detail-tiles--booking">
            <section className="detail-tile">
              <h3 className="detail-tile__title">Client details</h3>
              <dl className="detail-facts">
                <div>
                  <dt>Phone</dt>
                  <dd>{booking.client_phone ?? "—"}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{booking.client_email ?? "—"}</dd>
                </div>
                {booking.client_date_of_birth && (
                  <div>
                    <dt>Date of birth</dt>
                    <dd>{booking.client_date_of_birth}</dd>
                  </div>
                )}
              </dl>
              {booking.client_notes && (
                <div className="detail-note">
                  <strong>Client notes</strong>
                  <span>{booking.client_notes}</span>
                </div>
              )}
              {booking.internal_notes && (
                <div className="detail-note detail-note--internal">
                  <strong>Internal notes</strong>
                  <span>{booking.internal_notes}</span>
                </div>
              )}
            </section>

            <section className="detail-tile">
              <h3 className="detail-tile__title">Payment history</h3>
              <dl className="detail-facts detail-facts--compact">
                <div>
                  <dt>Deposit</dt>
                  <dd>£{Number(booking.deposit_amount).toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Subtotal</dt>
                  <dd>£{Number(booking.subtotal_amount).toFixed(2)}</dd>
                </div>
              </dl>
              {payments && payments.length > 0 ? (
                <ul className="detail-pay-list">
                  {payments.map((payment) => (
                    <li key={payment.id}>
                      <span>
                        £{payment.amount.toFixed(2)} · {payment.paymentType.replace(/_/g, " ")} ·{" "}
                        {payment.paymentMethod}
                      </span>
                      {payment.transactionReference ? (
                        <span className="detail-pay-list__ref">{payment.transactionReference}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="detail-tile__empty">No payments recorded yet.</p>
              )}
            </section>

            <section className="detail-tile detail-tile--span">
              <div className="detail-tile__head">
                <h3 className="detail-tile__title">Consent</h3>
                {booking.requires_consent_form_id && (
                  <span className={`detail-chip${booking.consent_signed ? " detail-chip--ok" : ""}`}>
                    {booking.consent_signed ? "Signed" : "Required"}
                  </span>
                )}
              </div>
              {needsConsent && (
                <button type="button" className="detail-tile__cta" onClick={onSignConsent}>
                  Get consent
                </button>
              )}
              {submissions === null ? (
                <p className="wizard-loading">Loading…</p>
              ) : submissions.length === 0 ? (
                <p className="detail-tile__empty">
                  {booking.requires_consent_form_id ? "Not signed yet." : "No consent form required."}
                </p>
              ) : (
                submissions.map((sub) => (
                  <div className="consent-document consent-document--detail" key={sub.id}>
                    <div className="consent-document__meta">
                      <span>{sub.template_name}</span>
                      <span className="detail-pay-list__ref">
                        {new Date(sub.signed_at).toLocaleString(undefined, { timeZone: STUDIO_TIMEZONE })}
                      </span>
                    </div>
                    <div className="consent-document__signatures">
                      <img src={sub.client_signature} alt="Client signature" />
                      {sub.artist_signature && <img src={sub.artist_signature} alt="Artist signature" />}
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>

        {chatOpen && (
          <aside className="detail-screen__chat detail-screen__chat--drawer">
            <div className="detail-screen__chat-header">
              <h3 className="detail-tile__title">Media &amp; chat</h3>
              <button
                type="button"
                className="detail-screen__chat-close"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
            <div className="detail-chat-panel">
              <div className="booking-chat detail-chat-panel__messages">
                {messages === null ? (
                  <p className="wizard-loading">Loading…</p>
                ) : messages.length === 0 ? (
                  <p className="detail-tile__empty">No messages yet — share reference photos here.</p>
                ) : (
                  messages.map((msg) => (
                    <div className="booking-chat__message" key={msg.id}>
                      <div className="booking-chat__bubble">
                        <span className="booking-chat__sender">
                          {msg.sender_name ?? (msg.sender_role === "client" ? "Client" : "Staff")}
                        </span>
                        {msg.body && <p>{msg.body}</p>}
                        {msg.media_url && <img src={msg.media_url} alt="Attachment" />}
                        <span className="booking-chat__time">
                          {new Date(msg.created_at).toLocaleString(undefined, { timeZone: STUDIO_TIMEZONE })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {pendingMedia && (
                <div className="booking-chat__preview">
                  <img src={pendingMedia} alt="Attachment preview" />
                  <button type="button" onClick={() => setPendingMedia(null)}>
                    Remove
                  </button>
                </div>
              )}
              <div className="booking-chat__composer detail-chat-panel__composer">
                <button
                  type="button"
                  className="detail-chat-panel__attach"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Photo
                </button>
                <input
                  type="text"
                  placeholder="Write a message…"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => void handleAttach(e)} />
                <button
                  type="button"
                  className="permissions-panel__save"
                  onClick={() => void sendMessage()}
                  disabled={sending || (!messageText.trim() && !pendingMedia)}
                >
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default BookingDetailPage;
