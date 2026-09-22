import { useState } from "react";
import Modal from "../Modal";
import BalancePaymentFlow from "./BalancePaymentFlow";
import type { BookingActionTarget } from "./useBookingActionModals";

interface CompleteBookingModalProps {
  booking: BookingActionTarget;
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onComplete: () => Promise<void>;
}

function CompleteBookingModal({ booking, fetchWithAuth, onClose, onComplete }: CompleteBookingModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const balanceDue = Number(booking.balance_due ?? 0);
  const clientName = `${booking.client_first_name} ${booking.client_last_name}`;

  async function markDone() {
    setSaving(true);
    setError(null);
    try {
      await onComplete();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (balanceDue > 0) {
    return (
      <Modal title="Complete session" subtitle={clientName} onClose={onClose} width="wide">
        <BalancePaymentFlow
          bookingId={booking.id}
          amount={balanceDue}
          clientName={clientName}
          fetchWithAuth={fetchWithAuth}
          amountLabel="Balance due to complete this job"
          doneLabel="Complete job"
          onPaid={() => void markDone()}
        />
        {error ? <p className="wizard-error">{error}</p> : null}
        {saving ? <p className="wizard-loading">Completing job…</p> : null}
      </Modal>
    );
  }

  return (
    <Modal title="Mark as done?" subtitle={clientName} onClose={onClose}>
      <p className="deposit-step__hint">Nothing left to pay — mark this booking as done?</p>
      {error ? <p className="wizard-error">{error}</p> : null}
      <div className="modal__actions">
        <button type="button" className="wizard-secondary-btn" onClick={onClose} disabled={saving}>
          Go back
        </button>
        <button
          type="button"
          className="permissions-panel__save"
          onClick={() => void markDone()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Mark done"}
        </button>
      </div>
    </Modal>
  );
}

export default CompleteBookingModal;
