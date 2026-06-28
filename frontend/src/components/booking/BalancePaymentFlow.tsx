import { useCallback, useEffect, useRef, useState } from "react";

type BalancePhase = "choose" | "cash" | "card-waiting" | "card-failed" | "bank" | "done";

interface BalancePaymentFlowProps {
  bookingId: number;
  amount: number;
  clientName: string;
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>;
  amountLabel?: string;
  doneLabel?: string;
  onPaid: () => void;
}

const TERMINAL_TX_DONE = new Set(["SUCCESSFUL", "FAILED", "CANCELLED"]);

function BalancePaymentFlow({
  bookingId,
  amount,
  clientName,
  fetchWithAuth,
  amountLabel = "Balance due",
  doneLabel = "Done — payment recorded",
  onPaid,
}: BalancePaymentFlowProps) {
  const [phase, setPhase] = useState<BalancePhase>("choose");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [envelopeCode, setEnvelopeCode] = useState<string | null>(null);
  const [bankReference, setBankReference] = useState("");
  const [cardLog, setCardLog] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLoggedRef = useRef("");

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const appendLog = (message: string) => {
    if (lastLoggedRef.current === message) return;
    lastLoggedRef.current = message;
    const stamp = new Date().toLocaleTimeString();
    setCardLog((prev) => [...prev, `${stamp} — ${message}`]);
  };

  const handleCash = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/bookings/${bookingId}/balance/cash`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not record cash payment");
      }
      const data = await res.json();
      setEnvelopeCode(data.envelopeCode);
      setPhase("cash");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const pollCard = (clientTransactionId: string) => {
    clearPoll();
    lastLoggedRef.current = "";
    setCardLog([]);
    appendLog("Payment sent to card reader — present card on terminal");

    const poll = async () => {
      const res = await fetchWithAuth(
        `/api/bookings/${bookingId}/balance/card/${encodeURIComponent(clientTransactionId)}`
      );
      if (!res.ok) {
        appendLog("Could not check payment status");
        return;
      }

      const data = await res.json();
      if (data.device?.state) appendLog(`Reader: ${data.device.state}`);
      if (data.transaction?.status) appendLog(`Transaction: ${data.transaction.status}`);

      if (!data.pending && data.transaction) {
        const status = data.transaction.status.toUpperCase();
        if (status === "SUCCESSFUL" && data.payment) {
          clearPoll();
          setPhase("done");
          return;
        }
        if (TERMINAL_TX_DONE.has(status) && status !== "SUCCESSFUL") {
          clearPoll();
          setPhase("card-failed");
          setError(`Card payment ${data.transaction.status.toLowerCase()}`);
        }
      }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), 2500);
  };

  const handleBank = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/bookings/${bookingId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          paymentMethod: "bank_transfer",
          paymentType: "balance",
          transactionReference: bankReference.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not record bank transfer");
      }
      setPhase("done");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCard = async () => {
    setSubmitting(true);
    setError(null);
    setPhase("card-waiting");
    try {
      const res = await fetchWithAuth(`/api/bookings/${bookingId}/balance/card`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not start card payment");
      }
      const data = await res.json();
      pollCard(data.clientTransactionId);
    } catch (err) {
      setPhase("choose");
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const formattedAmount = `£${amount.toFixed(2)}`;

  return (
    <div className="deposit-step">
      <div className="deposit-step__intro">
        <p className="deposit-step__label">{clientName}</p>
        <p className="deposit-step__amount">{formattedAmount}</p>
        <p className="deposit-step__sublabel">{amountLabel}</p>
      </div>

      {phase === "choose" && (
        <>
          <p className="deposit-step__hint">How is the customer paying?</p>
          <div className="deposit-step__methods">
            <button
              type="button"
              className="deposit-method deposit-method--cash"
              onClick={() => void handleCash()}
              disabled={submitting}
            >
              <span className="deposit-method__title">Cash</span>
              <span className="deposit-method__desc">Envelope with tracking code</span>
            </button>
            <button
              type="button"
              className="deposit-method deposit-method--card"
              onClick={() => void handleCard()}
              disabled={submitting}
            >
              <span className="deposit-method__title">Card</span>
              <span className="deposit-method__desc">Charge on SumUp terminal</span>
            </button>
            <button
              type="button"
              className="deposit-method deposit-method--bank"
              onClick={() => {
                setError(null);
                setPhase("bank");
              }}
              disabled={submitting}
            >
              <span className="deposit-method__title">Bank transfer</span>
              <span className="deposit-method__desc">Paid by transfer — record now</span>
            </button>
          </div>
        </>
      )}

      {phase === "bank" && (
        <div className="deposit-bank">
          <p className="deposit-step__hint">Record {formattedAmount} received by bank transfer</p>
          <label className="deposit-bank__field">
            <span>Reference (optional)</span>
            <input
              type="text"
              placeholder="e.g. last 4 digits or payment ref"
              value={bankReference}
              onChange={(e) => setBankReference(e.target.value)}
            />
          </label>
          {error ? <p className="wizard-error">{error}</p> : null}
          <button
            type="button"
            className="wizard-primary-btn wizard-primary-btn--full"
            onClick={() => void handleBank()}
            disabled={submitting}
          >
            {submitting ? "Recording…" : `Record ${formattedAmount} transfer`}
          </button>
          <button
            type="button"
            className="wizard-secondary-btn wizard-secondary-btn--full"
            onClick={() => {
              setPhase("choose");
              setError(null);
            }}
            disabled={submitting}
          >
            Back
          </button>
        </div>
      )}

      {phase === "cash" && envelopeCode && (
        <div className="deposit-envelope">
          <p className="deposit-envelope__amount">Put exactly {formattedAmount} in the envelope</p>
          <div className="deposit-envelope__code">{envelopeCode}</div>
          <ol className="deposit-envelope__steps">
            <li>Place {formattedAmount} cash inside the envelope.</li>
            <li>
              Write <strong>{envelopeCode}</strong> clearly on the front of the envelope.
            </li>
            <li>Store the envelope securely until banking.</li>
          </ol>
          <p className="deposit-envelope__note">
            This code links the cash to booking #{bookingId} for when you bank it.
          </p>
          <button type="button" className="wizard-primary-btn wizard-primary-btn--full" onClick={onPaid}>
            {doneLabel}
          </button>
        </div>
      )}

      {phase === "card-waiting" && (
        <div className="deposit-card-waiting">
          <p className="deposit-card-waiting__status">
            {submitting ? "Starting payment…" : `Waiting for ${formattedAmount} on card reader…`}
          </p>
          {cardLog.length > 0 ? (
            <div className="terminals-log deposit-card-waiting__log">
              {cardLog.map((line, index) => (
                <div key={`${index}-${line}`}>{line}</div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {phase === "card-failed" && (
        <div className="deposit-card-failed">
          <p className="wizard-error">{error ?? "Card payment did not complete"}</p>
          <button
            type="button"
            className="wizard-primary-btn wizard-primary-btn--full"
            onClick={() => {
              setPhase("choose");
              setError(null);
            }}
          >
            Try again
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="deposit-done">
          <p className="settings-panel__success">Payment of {formattedAmount} recorded</p>
          <button type="button" className="wizard-primary-btn wizard-primary-btn--full" onClick={onPaid}>
            {doneLabel}
          </button>
        </div>
      )}

      {error && phase === "choose" ? <p className="wizard-error">{error}</p> : null}
    </div>
  );
}

export default BalancePaymentFlow;
