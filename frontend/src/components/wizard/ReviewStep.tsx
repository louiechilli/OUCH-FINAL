import type { BookingDraft } from "../../pages/NewBookingWizard";
import { STUDIO_TIMEZONE } from "../../lib/timezone";

interface ReviewStepProps {
  draft: BookingDraft;
  submitting: boolean;
  error: string | null;
  onNotesChange: (notes: string) => void;
  onConfirm: () => void;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: STUDIO_TIMEZONE,
  });
}

function ReviewStep({ draft, submitting, error, onNotesChange, onConfirm }: ReviewStepProps) {
  const { service, client, artist, hours, rate, slot } = draft;
  const total = rate && hours ? rate.hourlyRate * hours : 0;

  return (
    <div className="wizard-step">
      <div className="wizard-review-card">
        <div className="wizard-review-row">
          <span>Service</span>
          <span>{service?.name}</span>
        </div>
        <div className="wizard-review-row">
          <span>Customer</span>
          <span>{client ? `${client.first_name} ${client.last_name}` : ""}</span>
        </div>
        <div className="wizard-review-row">
          <span>Artist</span>
          <span>{artist?.displayName}</span>
        </div>
        <div className="wizard-review-row">
          <span>When</span>
          <span>{slot ? formatDateTime(slot.startsAt) : ""}</span>
        </div>
        <div className="wizard-review-row">
          <span>Duration</span>
          <span>
            {hours} hr{hours !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="wizard-review-row wizard-review-row--total">
          <span>Total</span>
          <span>{total > 0 ? `£${total.toFixed(2)}` : "Free"}</span>
        </div>
        {rate && rate.depositAmount > 0 && (
          <div className="wizard-review-row">
            <span>Deposit due</span>
            <span>£{rate.depositAmount.toFixed(2)}</span>
          </div>
        )}
      </div>

      <label className="wizard-field">
        <span>Notes (optional)</span>
        <textarea
          rows={3}
          value={draft.notes ?? ""}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Anything the artist should know…"
        />
      </label>

      {error && <p className="wizard-error">{error}</p>}

      <button className="wizard-primary-btn wizard-primary-btn--full" disabled={submitting} onClick={onConfirm}>
        {submitting
          ? "Booking…"
          : rate && rate.depositAmount > 0
            ? "Confirm booking & collect deposit"
            : "Confirm booking"}
      </button>
    </div>
  );
}

export default ReviewStep;
