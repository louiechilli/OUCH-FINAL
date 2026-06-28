import { useCallback, useEffect, useState } from "react";
import { useAuth, useIsAdmin } from "../auth/AuthContext";

interface ClientOption {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
}

interface SystemStatus {
  redis: { connected: boolean };
  sms: { configured: boolean; provider: string; missing: string[] };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  } | null;
  bookings: { count: number };
}

interface SmsMessage {
  id: number;
  clientId: number | null;
  clientName: string | null;
  phoneNumbers: string[];
  body: string;
  status: string;
  provider: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface TestingPanelProps {
  onClose?: () => void;
  embedded?: boolean;
}

function TestingPanel({ onClose, embedded = false }: TestingPanelProps) {
  const { fetchWithAuth } = useAuth();
  const isAdmin = useIsAdmin();

  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [smsText, setSmsText] = useState("Hello from Ouch EPOS — test message");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetchWithAuth("/api/admin/testing/status");
    if (res.ok) setStatus(await res.json());
  }, [fetchWithAuth]);

  const loadMessages = useCallback(async () => {
    const res = await fetchWithAuth("/api/admin/testing/sms/messages");
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    }
  }, [fetchWithAuth]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadStatus(), loadMessages()]);
    } catch {
      setError("Could not load testing status");
    } finally {
      setLoading(false);
    }
  }, [loadStatus, loadMessages]);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchWithAuth(`/api/clients?search=${encodeURIComponent(clientQuery)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then(setClients)
        .catch(() => setClients([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [clientQuery, fetchWithAuth]);

  const handleSendSms = async () => {
    if (!selectedClient) {
      setError("Select a client first");
      return;
    }
    if (!selectedClient.phone?.trim()) {
      setError("Selected client has no phone number");
      return;
    }
    if (!smsText.trim()) {
      setError("Enter a message");
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth("/api/admin/testing/sms/send", {
        method: "POST",
        body: JSON.stringify({ clientId: selectedClient.id, message: smsText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not queue SMS");
      }
      setSuccess(`SMS queued for ${selectedClient.first_name} ${selectedClient.last_name}`);
      await loadMessages();
      await loadStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleClearBookings = async () => {
    const count = status?.bookings.count ?? 0;
    if (count === 0) {
      setError("There are no bookings to clear");
      return;
    }

    const ok = window.confirm(
      `Delete all ${count} booking(s)? This permanently removes payments, messages, consent forms, and portal links. Clients and services are kept.`
    );
    if (!ok) return;

    setClearing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth("/api/admin/testing/bookings/clear", {
        method: "POST",
        body: JSON.stringify({ confirm: "DELETE ALL BOOKINGS" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not clear bookings");
      }
      const data = await res.json();
      setSuccess(`Deleted ${data.deleted ?? count} booking(s)`);
      await loadStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClearing(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="panel">
        <h2>Access denied</h2>
      </div>
    );
  }

  return (
    <div className={embedded ? "settings-embedded-panel catalog-panel testing-panel" : "panel catalog-panel testing-panel"}>
      {embedded ? (
        <div className="settings-embedded-panel__header">
          <h3>Testing</h3>
          <p className="panel__subtitle">Debug tools and integration smoke tests</p>
        </div>
      ) : (
        <header className="panel-intro">
          <div className="panel-intro__content">
            <div className="panel-intro__heading">
              <h2>Testing</h2>
              <p className="panel__subtitle">Debug tools and integration smoke tests</p>
            </div>
          </div>
          <button className="panel-intro__action permissions-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
      )}

      {error ? <p className="permissions-panel__error">{error}</p> : null}
      {success ? <p className="settings-panel__success">{success}</p> : null}

      {loading ? (
        <p className="permissions-panel__loading">Loading…</p>
      ) : (
        <div className="settings-form">
          <div className="settings-form__section">
            <h3>System status</h3>
            <div className="terminals-status-card">
              <div className="terminals-status-row">
                <span>Redis queue</span>
                <span
                  className={`terminals-pill terminals-pill--${
                    status?.redis.connected ? "online" : "offline"
                  }`}
                >
                  {status?.redis.connected ? "Connected" : "Offline"}
                </span>
              </div>
              <div className="terminals-status-row">
                <span>SMS driver ({status?.sms.provider ?? "—"})</span>
                <span
                  className={`terminals-pill terminals-pill--${
                    status?.sms.configured ? "online" : "offline"
                  }`}
                >
                  {status?.sms.configured ? "Configured" : "Not configured"}
                </span>
              </div>
              {status?.queue ? (
                <div className="terminals-status-row">
                  <span>SMS queue</span>
                  <span>
                    {status.queue.waiting} waiting · {status.queue.active} active ·{" "}
                    {status.queue.failed} failed
                  </span>
                </div>
              ) : null}
            </div>
            <button type="button" className="permissions-panel__save" onClick={() => void refresh()}>
              Refresh status
            </button>
          </div>

          <div className="settings-form__section">
            <h3>Send test SMS</h3>
            <p className="settings-form__hint">
              Queues a message via the smsgate driver. Select a client with a phone number on file.
            </p>

            <label className="settings-field">
              <span>Search client</span>
              <input
                type="search"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                placeholder="Name, email or phone…"
              />
            </label>

            <ul className="testing-client-list">
              {clients.map((client) => (
                <li key={client.id}>
                  <button
                    type="button"
                    className={`catalog-list__item${
                      selectedClient?.id === client.id ? " catalog-list__item--selected" : ""
                    }`}
                    onClick={() => setSelectedClient(client)}
                  >
                    <span className="catalog-list__item-name">
                      {client.first_name} {client.last_name}
                    </span>
                    <span className="catalog-list__item-meta">
                      {client.phone ?? "No phone"} {client.email ? `· ${client.email}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {selectedClient ? (
              <p className="settings-form__hint">
                Sending to <strong>{selectedClient.phone}</strong>
              </p>
            ) : null}

            <label className="settings-field">
              <span>Message</span>
              <textarea rows={3} value={smsText} onChange={(e) => setSmsText(e.target.value)} />
            </label>

            <button
              type="button"
              className="permissions-panel__save"
              onClick={() => void handleSendSms()}
              disabled={sending || !selectedClient || !status?.sms.configured || !status?.redis.connected}
            >
              {sending ? "Queueing…" : "Send test SMS"}
            </button>
          </div>

          <div className="settings-form__section settings-form__section--danger">
            <h3>Clear all bookings</h3>
            <p className="settings-form__hint">
              Permanently deletes every booking and related records (payments, messages, consent,
              portal tokens). Clients, artists, and catalog data are not affected.
            </p>
            <p className="settings-form__hint">
              Currently <strong>{status?.bookings.count ?? 0}</strong> booking(s) in the database.
            </p>
            <button
              type="button"
              className="permissions-panel__save permissions-panel__save--danger"
              onClick={() => void handleClearBookings()}
              disabled={clearing || !status?.bookings.count}
            >
              {clearing ? "Deleting…" : "Clear all bookings"}
            </button>
          </div>

          <div className="settings-form__section">
            <h3>Recent SMS</h3>
            {messages.length === 0 ? (
              <p className="permissions-panel__note">No messages yet.</p>
            ) : (
              <ul className="testing-sms-log">
                {messages.map((msg) => (
                  <li key={msg.id} className="testing-sms-log__item">
                    <div className="testing-sms-log__header">
                      <span className={`testing-sms-log__status testing-sms-log__status--${msg.status}`}>
                        {msg.status}
                      </span>
                      <span className="settings-form__hint">
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="testing-sms-log__to">
                      {msg.clientName ?? "Unknown"} → {msg.phoneNumbers.join(", ")}
                    </p>
                    <p className="testing-sms-log__body">{msg.body}</p>
                    {msg.errorMessage ? (
                      <p className="permissions-panel__error">{msg.errorMessage}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TestingPanel;
