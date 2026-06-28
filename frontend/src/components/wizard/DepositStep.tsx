import { useCallback, useEffect, useRef, useState } from "react";

type DepositPhase = "choose" | "cash" | "card-waiting" | "card-failed" | "done";

interface DepositStepProps {
  bookingId: number;
  depositAmount: number;
  clientName: string;
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>;
  onComplete: () => void;
}

const TERMINAL_TX_DONE = new Set(["SUCCESSFUL", "FAILED", "CANCELLED"]);

function DepositStep({
  bookingId,
  depositAmount,
  clientName,
  fetchWithAuth,
  onComplete,
}: DepositStepProps) {
  const [phase, setPhase] = useState<DepositPhase>("choose");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [envelopeCode, setEnvelopeCode] = useState<string | null>(null);
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
      const res = await fetchWithAuth(`/api/bookings/${bookingId}/deposit/cash`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not record cash deposit");
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
        `/api/bookings/${bookingId}/deposit/card/${encodeURIComponent(clientTransactionId)}`
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

  const handleCard = async () => {
    setSubmitting(true);
    setError(null);
    setPhase("card-waiting");
    try {
      const res = await fetchWithAuth(`/api/bookings/${bookingId}/deposit/card`, {
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

  const formattedAmount = `£${depositAmount.toFixed(2)}`;

  return (
    <div className="wizard-step">
      <div className="deposit-step__intro">
        <p className="deposit-step__label">Booking confirmed for {clientName}</p>
        <p className="deposit-step__amount">{formattedAmount}</p>
        <p className="deposit-step__sublabel">Deposit required now</p>
      </div>

      {phase === "choose" && (
        <>
          <p className="deposit-step__hint">How is the customer paying the deposit?</p>
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
          </div>
        </>
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
          <button type="button" className="wizard-primary-btn wizard-primary-btn--full" onClick={onComplete}>
            Done — deposit recorded
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
          <p className="settings-panel__success">Deposit of {formattedAmount} collected by card</p>
          <button type="button" className="wizard-primary-btn wizard-primary-btn--full" onClick={onComplete}>
            Done
          </button>
        </div>
      )}

      {error && phase === "choose" ? <p className="wizard-error">{error}</p> : null}
    </div>
  );
}

export default DepositStep;
