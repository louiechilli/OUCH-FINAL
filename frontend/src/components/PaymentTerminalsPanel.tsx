import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useIsAdmin } from "../auth/AuthContext";

interface TerminalConfig {
  configured: boolean;
  merchantCode: string | null;
  currency: string;
  missing: string[];
}

interface TerminalReader {
  id: number;
  provider: string;
  externalId: string;
  name: string;
  deviceModel: string | null;
  deviceIdentifier: string | null;
  isDefault: boolean;
  remoteStatus: string | null;
  device: { identifier: string; model: string } | null;
}

interface DeviceStatus {
  status: "ONLINE" | "OFFLINE";
  state?: string;
  batteryLevel?: number;
  connectionType?: string;
  firmwareVersion?: string;
  lastActivity?: string;
}

interface PaymentPollResult {
  transaction: {
    clientTransactionId: string;
    status: string;
    amount?: number;
    currency?: string;
    transactionCode?: string;
    timestamp?: string;
  } | null;
  device: DeviceStatus | null;
  pending: boolean;
}

interface PaymentTerminalsPanelProps {
  onClose?: () => void;
  embedded?: boolean;
}

const TERMINAL_STATES = new Set(["SUCCESSFUL", "FAILED", "CANCELLED", "REFUNDED", "CHARGE_BACK"]);

function formatMoney(minorUnits: number, currency: string): string {
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${(minorUnits / 100).toFixed(2)}`;
}

function PaymentTerminalsPanel({ onClose, embedded = false }: PaymentTerminalsPanelProps) {
  const { fetchWithAuth } = useAuth();
  const isAdmin = useIsAdmin();

  const [config, setConfig] = useState<TerminalConfig | null>(null);
  const [readers, setReaders] = useState<TerminalReader[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingName, setPairingName] = useState("Front desk Solo");
  const [testAmount, setTestAmount] = useState("1.00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [paymentLog, setPaymentLog] = useState<string[]>([]);
  const [paymentActive, setPaymentActive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLoggedRef = useRef<string>("");

  const selected = readers.find((r) => r.id === selectedId) ?? null;

  const clearPaymentPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPaymentActive(false);
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await fetchWithAuth("/api/admin/terminals/config");
    if (res.ok) setConfig(await res.json());
  }, [fetchWithAuth]);

  const loadReaders = useCallback(async () => {
    const res = await fetchWithAuth("/api/admin/terminals/readers");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Could not load terminals");
    }
    const data = await res.json();
    setReaders(data.readers ?? []);
    return data.readers as TerminalReader[];
  }, [fetchWithAuth]);

  const loadDeviceStatus = useCallback(
    async (terminalId: number) => {
      const res = await fetchWithAuth(`/api/admin/terminals/readers/${terminalId}/status`);
      if (!res.ok) return;
      const data = await res.json();
      setDeviceStatus(data.device ?? null);
    },
    [fetchWithAuth]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadConfig();
      const list = await loadReaders();
      if (selectedId && !list.some((r: TerminalReader) => r.id === selectedId)) {
        setSelectedId(null);
        setDeviceStatus(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadConfig, loadReaders, selectedId]);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  useEffect(() => {
    if (!selectedId) {
      setDeviceStatus(null);
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
      return;
    }

    void loadDeviceStatus(selectedId);
    statusPollRef.current = setInterval(() => {
      void loadDeviceStatus(selectedId);
    }, 8000);

    return () => {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    };
  }, [selectedId, loadDeviceStatus]);

  useEffect(() => () => clearPaymentPoll(), [clearPaymentPoll]);

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError(null);
    setTimeout(() => setSuccess(null), 4000);
  };

  const appendLog = (message: string) => {
    if (lastLoggedRef.current === message) return;
    lastLoggedRef.current = message;
    const stamp = new Date().toLocaleTimeString();
    setPaymentLog((prev) => [...prev, `${stamp} — ${message}`]);
  };

  const handlePair = async () => {
    if (!pairingCode.trim() || !pairingName.trim()) {
      setError("Enter the pairing code from your Solo and a name for this terminal");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/admin/terminals/readers", {
        method: "POST",
        body: JSON.stringify({
          pairingCode: pairingCode.trim(),
          name: pairingName.trim(),
          setAsDefault: readers.length === 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not pair terminal");
      }
      const data = await res.json();
      setPairingCode("");
      showSuccess(`Paired "${data.reader.name}" — confirm on the Solo screen`);
      const list = await loadReaders();
      const stored = list.find((r) => r.externalId === data.reader.id);
      if (stored) setSelectedId(stored.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (terminal: TerminalReader) => {
    if (!confirm(`Remove "${terminal.name}" from SumUp and this EPOS? You will also need to disconnect API on the Solo device.`)) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/admin/terminals/readers/${terminal.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not remove terminal");
      }
      if (selectedId === terminal.id) setSelectedId(null);
      showSuccess(`Removed "${terminal.name}"`);
      await loadReaders();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (terminal: TerminalReader) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/terminals/readers/${terminal.id}/default`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Could not set default terminal");
      await loadReaders();
      showSuccess(`"${terminal.name}" is now the default terminal`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const pollPayment = (clientTransactionId: string, terminalId: number) => {
    clearPaymentPoll();
    setPaymentActive(true);
    setPaymentLog([]);
    lastLoggedRef.current = "";
    appendLog("Checkout sent to Solo — waiting for card…");

    const poll = async () => {
      const res = await fetchWithAuth(
        `/api/admin/terminals/payments/${encodeURIComponent(clientTransactionId)}?terminalId=${terminalId}`
      );
      if (!res.ok) {
        appendLog("Could not check payment status");
        return;
      }

      const data = (await res.json()) as PaymentPollResult;
      if (data.device?.state) {
        appendLog(`Reader state: ${data.device.state}`);
      }
      if (data.device?.status) {
        appendLog(`Connectivity: ${data.device.status}`);
      }

      if (data.transaction) {
        appendLog(`Transaction status: ${data.transaction.status}`);
        if (data.transaction.transactionCode) {
          appendLog(`Receipt code: ${data.transaction.transactionCode}`);
        }
        if (TERMINAL_STATES.has(data.transaction.status.toUpperCase())) {
          clearPaymentPoll();
          if (data.transaction.status.toUpperCase() === "SUCCESSFUL") {
            showSuccess("Test payment completed successfully");
          } else {
            setError(`Payment ended: ${data.transaction.status}`);
          }
        }
      } else if (!data.pending) {
        appendLog("Waiting for transaction record…");
      }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), 2500);
  };

  const handleTestPayment = async () => {
    if (!selected) return;

    const parsed = Number.parseFloat(testAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid test amount");
      return;
    }

    const amountMinorUnits = Math.round(parsed * 100);
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/admin/terminals/readers/${selected.id}/test-payment`, {
        method: "POST",
        body: JSON.stringify({ amountMinorUnits }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not send test payment");
      }
      const data = await res.json();
      showSuccess(`Sent ${formatMoney(amountMinorUnits, config?.currency ?? "GBP")} to ${selected.name}`);
      pollPayment(data.clientTransactionId, selected.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTerminate = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/terminals/readers/${selected.id}/terminate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Could not cancel checkout");
      appendLog("Cancel requested on reader");
      clearPaymentPoll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="panel">
        <div className="panel__header">
          <h2>Access denied</h2>
          <p className="panel__subtitle">Admin access is required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "settings-embedded-panel catalog-panel terminals-panel" : "panel catalog-panel terminals-panel"}>
      {embedded ? (
        <div className="settings-embedded-panel__header">
          <h3>Payment terminal</h3>
          <p className="panel__subtitle">Connect and manage your SumUp Solo card reader</p>
        </div>
      ) : (
        <header className="panel-intro">
          <div className="panel-intro__content">
            <div className="panel-intro__heading">
              <h2>Payment terminal</h2>
              <p className="panel__subtitle">Connect and manage your SumUp Solo card reader</p>
            </div>
          </div>
          <button className="panel-intro__action permissions-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
      )}

      {error ? <p className="permissions-panel__error">{error}</p> : null}
      {success ? <p className="settings-panel__success">{success}</p> : null}

      {config && !config.configured ? (
        <div className="terminals-banner terminals-banner--warning">
          <strong>SumUp is not configured.</strong> Add these environment variables to the backend and restart:
          <code>{config.missing.join(", ")}</code>
        </div>
      ) : config?.configured ? (
        <div className="terminals-banner terminals-banner--ok">
          Connected to merchant <strong>{config.merchantCode}</strong> · currency {config.currency}
        </div>
      ) : null}

      {loading ? (
        <p className="permissions-panel__loading">Loading…</p>
      ) : (
        <div className="catalog-layout">
          <div className="catalog-list">
            <div className="catalog-list__header">
              <h3>Terminals</h3>
              <button type="button" className="catalog-list__add" onClick={() => setSelectedId(-1)}>
                + Pair
              </button>
            </div>

            {readers.length === 0 ? (
              <p className="catalog-list__empty">No terminals paired yet.</p>
            ) : (
              <ul>
                {readers.map((reader) => (
                  <li key={reader.id}>
                    <button
                      type="button"
                      className={`catalog-list__item${
                        selectedId === reader.id ? " catalog-list__item--selected" : ""
                      }`}
                      onClick={() => setSelectedId(reader.id)}
                    >
                      <span className="catalog-list__item-name">
                        {reader.name}
                        {reader.isDefault ? " · Default" : ""}
                      </span>
                      <span className="catalog-list__item-meta">
                        {reader.device?.model ?? reader.deviceModel ?? "Solo"}
                        {reader.remoteStatus ? ` · ${reader.remoteStatus}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="terminals-pair-hint">
              <p>
                On the Solo: swipe down → <strong>Connections</strong> → <strong>API</strong> →{" "}
                <strong>Connect</strong>. The device must be logged out of a merchant account.
              </p>
            </div>
          </div>

          <div className="catalog-editor">
            {selectedId === -1 ? (
              <div className="settings-form">
                <div className="settings-form__section">
                  <h3>Pair new terminal</h3>
                  <p className="settings-form__hint">
                    Enter the pairing code shown on the Solo screen (expires in 5 minutes).
                  </p>
                  <label className="settings-field">
                    <span>Terminal name</span>
                    <input
                      type="text"
                      value={pairingName}
                      onChange={(e) => setPairingName(e.target.value)}
                      placeholder="e.g. Front desk"
                    />
                  </label>
                  <label className="settings-field">
                    <span>Pairing code</span>
                    <input
                      type="text"
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                      placeholder="e.g. 4WLFDSBF"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <button
                    className="permissions-panel__save"
                    onClick={() => void handlePair()}
                    disabled={saving || !config?.configured}
                  >
                    {saving ? "Pairing…" : "Pair terminal"}
                  </button>
                </div>
              </div>
            ) : selected ? (
              <div className="settings-form">
                <div className="settings-form__section">
                  <h3>{selected.name}</h3>
                  <p className="settings-form__hint">
                    {selected.device?.identifier ?? selected.deviceIdentifier ?? "Unknown device"}
                  </p>

                  <div className="terminals-status-card">
                    <div className="terminals-status-row">
                      <span>Connectivity</span>
                      <span
                        className={`terminals-pill terminals-pill--${
                          deviceStatus?.status === "ONLINE" ? "online" : "offline"
                        }`}
                      >
                        {deviceStatus?.status ?? "Unknown"}
                      </span>
                    </div>
                    {deviceStatus?.state ? (
                      <div className="terminals-status-row">
                        <span>Reader state</span>
                        <span>{deviceStatus.state}</span>
                      </div>
                    ) : null}
                    {deviceStatus?.connectionType ? (
                      <div className="terminals-status-row">
                        <span>Connection</span>
                        <span>{deviceStatus.connectionType}</span>
                      </div>
                    ) : null}
                    {deviceStatus?.batteryLevel !== undefined ? (
                      <div className="terminals-status-row">
                        <span>Battery</span>
                        <span>{Math.round(deviceStatus.batteryLevel)}%</span>
                      </div>
                    ) : null}
                    {deviceStatus?.firmwareVersion ? (
                      <div className="terminals-status-row">
                        <span>Firmware</span>
                        <span>{deviceStatus.firmwareVersion}</span>
                      </div>
                    ) : null}
                    {selected.remoteStatus ? (
                      <div className="terminals-status-row">
                        <span>Pairing</span>
                        <span>{selected.remoteStatus}</span>
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="permissions-panel__save"
                    onClick={() => selectedId && void loadDeviceStatus(selectedId)}
                    disabled={saving}
                  >
                    Refresh status
                  </button>

                  {!selected.isDefault ? (
                    <button
                      type="button"
                      className="permissions-panel__save"
                      onClick={() => void handleSetDefault(selected)}
                      disabled={saving}
                    >
                      Set as default
                    </button>
                  ) : null}
                </div>

                <div className="settings-form__section">
                  <h3>Test payment</h3>
                  <p className="settings-form__hint">
                    Sends a real charge to the Solo. Use a small amount to verify connectivity end-to-end.
                  </p>
                  <label className="settings-field">
                    <span>Amount ({config?.currency ?? "GBP"})</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={testAmount}
                      onChange={(e) => setTestAmount(e.target.value)}
                      disabled={paymentActive}
                    />
                  </label>
                  <div className="terminals-actions">
                    <button
                      className="permissions-panel__save"
                      onClick={() => void handleTestPayment()}
                      disabled={saving || paymentActive || !config?.configured || selected.remoteStatus !== "paired"}
                    >
                      {paymentActive ? "Waiting for card…" : "Send test payment"}
                    </button>
                    {paymentActive ? (
                      <button
                        type="button"
                        className="settings-panel__logout"
                        onClick={() => void handleTerminate()}
                        disabled={saving}
                      >
                        Cancel on reader
                      </button>
                    ) : null}
                  </div>

                  {paymentLog.length > 0 ? (
                    <div className="terminals-log">
                      {paymentLog.map((line, index) => (
                        <div key={`${index}-${line}`}>{line}</div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="settings-form__section settings-form__section--danger">
                  <h3>Remove terminal</h3>
                  <p className="settings-form__hint">
                    Unpairs from SumUp. Also disconnect API on the Solo (Connections → API → Disconnect).
                  </p>
                  <button
                    type="button"
                    className="settings-panel__logout"
                    onClick={() => void handleRemove(selected)}
                    disabled={saving || paymentActive}
                  >
                    Remove terminal
                  </button>
                </div>
              </div>
            ) : (
              <p className="catalog-editor__placeholder">
                Select a terminal to view connectivity and send a test payment, or pair a new one.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentTerminalsPanel;
