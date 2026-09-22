import { useState } from "react";
import Modal from "../Modal";
import { CANCEL_REASONS, resolveCancelReason } from "./cancelReasons";

interface CancelBookingModalProps {
  clientName: string;
  onClose: () => void;
  onConfirm: (cancellationReason: string | null) => Promise<void>;
}

function CancelBookingModal({ clientName, onClose, onConfirm }: CancelBookingModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>(CANCEL_REASONS[0].id);
  const [customReason, setCustomReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(resolveCancelReason(selectedReason, customReason));
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Cancel booking"
      subtitle={`${clientName} — choose a reason (optional)`}
      onClose={onClose}
    >
      <div className="modal-reason-list">
        {CANCEL_REASONS.map((reason) => (
          <label key={reason.id} className="modal-reason">
            <input
              type="radio"
              name="cancel-reason"
              checked={selectedReason === reason.id}
              onChange={() => setSelectedReason(reason.id)}
            />
            <span>{reason.label}</span>
          </label>
        ))}
      </div>

      {selectedReason === "other" && (
        <label className="settings-field">
          <span>Details</span>
          <textarea
            rows={3}
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Why is this booking being cancelled?"
          />
        </label>
      )}

      {error && <p className="wizard-error">{error}</p>}

      <div className="modal__actions">
        <button type="button" className="wizard-secondary-btn" onClick={onClose} disabled={saving}>
          Keep booking
        </button>
        <button
          type="button"
          className="permissions-panel__save permissions-panel__save--danger"
          onClick={() => void handleSubmit()}
          disabled={saving}
        >
          {saving ? "Cancelling…" : "Cancel booking"}
        </button>
      </div>
    </Modal>
  );
}

export default CancelBookingModal;
