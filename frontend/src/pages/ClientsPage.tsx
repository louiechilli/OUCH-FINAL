import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { STUDIO_TIMEZONE } from "../lib/timezone";
import BookingDetailPage from "./BookingDetailPage";
import ConsentFormPage, { type ConsentFormBooking } from "./ConsentFormPage";
import BookingStatusPill from "../components/BookingStatusPill";

export interface ClientRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  notes: string | null;
  created_at: string;
  booking_count: number;
  last_booking_at: string | null;
  total_spent: string;
}

export type ClientHistoryKind = "client_created" | "booking" | "payment" | "consent" | "booking_event";

export interface ClientHistoryItem {
  kind: ClientHistoryKind;
  occurredAt: string;
  title: string;
  description: string | null;
  bookingId: number | null;
  metadata: Record<string, unknown>;
}

interface ClientsPageProps {
  onBack: () => void;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: STUDIO_TIMEZONE,
  });
}

function formatShortDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: STUDIO_TIMEZONE,
  });
}

function ClientListRow({ client, onSelect }: { client: ClientRow; onSelect: (client: ClientRow) => void }) {
  const contact = client.phone ?? client.email ?? "No contact details";

  return (
    <button type="button" className="client-row" onClick={() => onSelect(client)}>
      <div className="client-row__avatar" aria-hidden="true">
        {client.first_name.charAt(0)}
        {client.last_name.charAt(0)}
      </div>
      <div className="client-row__info">
        <span className="client-row__name">
          {client.first_name} {client.last_name}
        </span>
        <span className="client-row__meta">{contact}</span>
      </div>
      <div className="client-row__stats">
        <span>{client.booking_count} booking{client.booking_count === 1 ? "" : "s"}</span>
        <span>Last visit {formatShortDate(client.last_booking_at)}</span>
      </div>
      <span className="booking-row__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function ClientsPage({ onBack }: ClientsPageProps) {
  const { fetchWithAuth } = useAuth();
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingClientId, setViewingClientId] = useState<number | null>(null);
  const [viewingBookingId, setViewingBookingId] = useState<number | null>(null);
  const [signingBooking, setSigningBooking] = useState<ConsentFormBooking | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadClients = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      const res = await fetchWithAuth(`/api/clients?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load clients");
      const data: ClientRow[] = await res.json();
      setClients(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [fetchWithAuth, query]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setClients(null);
      void loadClients();
    }, query ? 250 : 0);
    return () => clearTimeout(handle);
  }, [loadClients, query, refreshKey]);

  if (signingBooking) {
    return (
      <ConsentFormPage
        booking={signingBooking}
        onClose={() => setSigningBooking(null)}
        onSubmitted={() => {
          setSigningBooking(null);
          setRefreshKey((key) => key + 1);
        }}
      />
    );
  }

  if (viewingBookingId !== null) {
    return (
      <BookingDetailPage
        bookingId={viewingBookingId}
        onBack={() => setViewingBookingId(null)}
        onChanged={() => setRefreshKey((key) => key + 1)}
        onSignConsent={async () => {
          const res = await fetchWithAuth(`/api/bookings/${viewingBookingId}`);
          if (!res.ok) return;
          const booking = await res.json();
          if (!booking.requires_consent_form_id) return;
          setViewingBookingId(null);
          setSigningBooking({
            id: booking.id,
            client_first_name: booking.client_first_name,
            client_last_name: booking.client_last_name,
            client_email: booking.client_email,
            client_phone: booking.client_phone,
            client_date_of_birth: booking.client_date_of_birth,
            artist_display_name: booking.artist_display_name,
            requires_consent_form_id: booking.requires_consent_form_id,
          });
        }}
      />
    );
  }

  if (viewingClientId !== null) {
    return (
      <ClientDetailPage
        clientId={viewingClientId}
        onBack={() => setViewingClientId(null)}
        onViewBooking={setViewingBookingId}
        refreshKey={refreshKey}
      />
    );
  }

  return (
    <div className="bookings-page clients-page">
      <header className="clients-page__header">
        <button type="button" className="settings-page__back" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <div className="clients-page__header-body">
          <div className="panel-intro__heading">
            <h2>Clients</h2>
            <p className="panel__subtitle">Search and browse your client directory</p>
          </div>

          <div className="clients-page__search wizard-search-bar">
            <span>⌕</span>
            <input
              type="search"
              placeholder="Search by name, phone or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      {error && <p className="wizard-error">{error}</p>}

      <div className="panel__scroll">
        <div className="client-list">
          {clients === null && !error && <p className="wizard-loading">Loading…</p>}
          {clients?.length === 0 && <p className="wizard-empty">No clients match your search.</p>}
          {clients?.map((client) => (
            <ClientListRow key={client.id} client={client} onSelect={() => setViewingClientId(client.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ClientDetailPageProps {
  clientId: number;
  onBack: () => void;
  onViewBooking: (bookingId: number) => void;
  refreshKey: number;
}

function historyKindLabel(kind: ClientHistoryKind) {
  if (kind === "booking") return "Appointment";
  if (kind === "payment") return "Payment";
  if (kind === "consent") return "Consent";
  if (kind === "booking_event") return "Activity";
  return "Profile";
}

function ClientDetailPage({ clientId, onBack, onViewBooking, refreshKey }: ClientDetailPageProps) {
  const { fetchWithAuth } = useAuth();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [history, setHistory] = useState<ClientHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const [clientRes, historyRes] = await Promise.all([
          fetchWithAuth(`/api/clients/${clientId}`),
          fetchWithAuth(`/api/clients/${clientId}/history`),
        ]);
        if (!clientRes.ok || !historyRes.ok) throw new Error("Could not load client");
        const [clientData, historyData] = await Promise.all([clientRes.json(), historyRes.json()]);
        if (cancelled) return;
        setClient(clientData);
        setHistory(historyData);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [clientId, fetchWithAuth, refreshKey]);

  const initials = client
    ? `${client.first_name.charAt(0)}${client.last_name.charAt(0)}`
    : "";

  return (
    <div className="detail-screen detail-screen--client">
      <header className="detail-screen__toolbar">
        <button type="button" className="detail-screen__back" onClick={onBack}>
          ← Back
        </button>
        <div className="detail-screen__title">
          <h2>{client ? `${client.first_name} ${client.last_name}` : "Client"}</h2>
          <p>{client?.phone ?? client?.email ?? "Loading…"}</p>
        </div>
        {client && (
          <div className="detail-screen__stat-chips">
            <span className="detail-stat-chip">
              <strong>{client.booking_count}</strong> bookings
            </span>
            <span className="detail-stat-chip">
              <strong>£{Number(client.total_spent).toFixed(0)}</strong> spent
            </span>
            <span className="detail-stat-chip">
              Last visit <strong>{formatShortDate(client.last_booking_at)}</strong>
            </span>
          </div>
        )}
      </header>

      {error && <p className="detail-screen__alert wizard-error">{error}</p>}

      <div className="detail-screen__body detail-screen__body--client">
        <aside className="detail-screen__rail">
          {client ? (
            <>
              <div className="detail-client-avatar" aria-hidden="true">
                {initials}
              </div>
              <section className="detail-tile detail-tile--flat">
                <h3 className="detail-tile__title">Contact</h3>
                <dl className="detail-facts detail-facts--stack">
                  <div>
                    <dt>Phone</dt>
                    <dd>{client.phone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{client.email ?? "—"}</dd>
                  </div>
                  {client.date_of_birth && (
                    <div>
                      <dt>Date of birth</dt>
                      <dd>{client.date_of_birth}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Client since</dt>
                    <dd>{formatShortDate(client.created_at)}</dd>
                  </div>
                </dl>
                {client.notes && (
                  <div className="detail-note">
                    <strong>Notes</strong>
                    <span>{client.notes}</span>
                  </div>
                )}
              </section>
            </>
          ) : (
            <p className="wizard-loading">Loading…</p>
          )}
        </aside>

        <main className="detail-screen__main detail-screen__main--client">
          <section className="client-history-panel">
            <h3 className="detail-tile__title">History</h3>
            {history === null && !error && <p className="wizard-loading">Loading timeline…</p>}
            {history?.length === 0 && <p className="detail-tile__empty">No activity yet.</p>}
            <div className="client-timeline client-timeline--wide">
              {history?.map((item, index) => {
                const clickable = item.bookingId !== null && item.kind !== "client_created";
                const status = item.metadata.status;

                return (
                  <div
                    key={`${item.kind}-${item.occurredAt}-${index}`}
                    className={`client-timeline__item client-timeline__item--${item.kind}${
                      clickable ? " client-timeline__item--clickable" : ""
                    }`}
                    onClick={clickable ? () => onViewBooking(item.bookingId!) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onViewBooking(item.bookingId!);
                            }
                          }
                        : undefined
                    }
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                  >
                    <div className="client-timeline__marker" aria-hidden="true" />
                    <div className="client-timeline__body">
                      <div className="client-timeline__header">
                        <span className="client-timeline__kind">{historyKindLabel(item.kind)}</span>
                        <span className="client-timeline__when">{formatWhen(item.occurredAt)}</span>
                      </div>
                      <p className="client-timeline__title">{item.title}</p>
                      {item.description && <p className="client-timeline__description">{item.description}</p>}
                      {item.kind === "booking" && status ? (
                        <div className="client-timeline__tags">
                          <BookingStatusPill status={String(status)} />
                        </div>
                      ) : null}
                      {item.kind === "payment" && item.metadata.status === "pending" ? (
                        <span className="pill pill--pending">Pending</span>
                      ) : null}
                    </div>
                    {clickable && (
                      <span className="client-timeline__chevron" aria-hidden="true">
                        ›
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default ClientsPage;
