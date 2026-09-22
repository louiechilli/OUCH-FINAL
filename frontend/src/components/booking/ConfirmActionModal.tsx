import { useState } from "react";
import Modal from "../Modal";

interface ConfirmActionModalProps {
  title: string;
  subtitle: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function ConfirmActionModal({
  title,
  subtitle,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: ConfirmActionModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      {error && <p className="wizard-error">{error}</p>}
      <div className="modal__actions">
        <button type="button" className="wizard-secondary-btn" onClick={onClose} disabled={saving}>
          Go back
        </button>
        <button
          type="button"
          className={`permissions-panel__save${danger ? " permissions-panel__save--danger" : ""}`}
          onClick={() => void handleSubmit()}
          disabled={saving}
        >
          {saving ? "Saving…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmActionModal;
