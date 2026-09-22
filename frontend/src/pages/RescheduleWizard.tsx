import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import WizardHeader from "../components/wizard/WizardHeader";
import TimeSlotStep from "../components/wizard/TimeSlotStep";
import type { ArtistOption, BookingSlot } from "./NewBookingWizard";
import { STUDIO_TIMEZONE, studioDateKey } from "../lib/timezone";

interface RescheduleBooking {
  id: number;
  artist_id: number;
  artist_display_name: string;
  starts_at: string;
  ends_at: string;
  duration_hours: string;
  service_name: string;
  client_first_name: string;
  client_last_name: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
}

interface RescheduleWizardProps {
  bookingId: number;
  onClose: () => void;
  onRescheduled: () => void;
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

function RescheduleWizard({ bookingId, onClose, onRescheduled }: RescheduleWizardProps) {
  const { fetchWithAuth } = useAuth();
  const [booking, setBooking] = useState<RescheduleBooking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<"time" | "review">("time");
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [date, setDate] = useState<string | undefined>();
  const [slot, setSlot] = useState<BookingSlot | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithAuth(`/api/bookings/${bookingId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load booking");
        const data = (await res.json()) as RescheduleBooking;
        setBooking(data);
        setDate(studioDateKey(new Date(data.starts_at)));
        setSlot({ startsAt: data.starts_at, endsAt: data.ends_at });
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [bookingId, fetchWithAuth]);

  if (loadError) {
    return (
      <div className="wizard-screen wizard-screen--fullscreen">
        <WizardHeader title="Reschedule" stepIndex={0} stepCount={2} onBack={onClose} />
        <div className="wizard-body">
          <p className="wizard-error">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="wizard-screen wizard-screen--fullscreen">
        <WizardHeader title="Reschedule" stepIndex={0} stepCount={2} onBack={onClose} />
        <div className="wizard-body">
          <p className="wizard-loading">Loading booking…</p>
        </div>
      </div>
    );
  }

  const artist: ArtistOption = { id: booking.artist_id, displayName: booking.artist_display_name };
  const hours = Number(booking.duration_hours);
  const clientName = `${booking.client_first_name} ${booking.client_last_name}`;
  const slotChanged = slot && (slot.startsAt !== booking.starts_at || slot.endsAt !== booking.ends_at);

  async function handleConfirm() {
    if (!slot || !slotChanged) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetchWithAuth(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ startsAt: slot.startsAt, endsAt: slot.endsAt }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not reschedule booking");
      }
      onRescheduled();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    if (step === "review") {
      setDirection("back");
      setStep("time");
      return;
    }
    onClose();
  }

  return (
    <div className="wizard-screen wizard-screen--fullscreen">
      <WizardHeader
        title={step === "time" ? "Pick a new time" : "Confirm reschedule"}
        stepIndex={step === "time" ? 0 : 1}
        stepCount={2}
        onBack={goBack}
      />
      <div className={`wizard-body wizard-body--${direction}`} key={step}>
        {step === "time" ? (
          <TimeSlotStep
            fetchWithAuth={fetchWithAuth}
            artist={artist}
            hours={hours}
            initialDate={date}
            initialSlot={slot}
            excludeBookingId={bookingId}
            onContinue={(nextDate, nextSlot) => {
              setDate(nextDate);
              setSlot(nextSlot);
              setDirection("forward");
              setStep("review");
            }}
          />
        ) : (
          <div className="wizard-step">
            <div className="wizard-review-card">
              <div className="wizard-review-row">
                <span>Client</span>
                <span>{clientName}</span>
              </div>
              <div className="wizard-review-row">
                <span>Service</span>
                <span>{booking.service_name}</span>
              </div>
              <div className="wizard-review-row">
                <span>Artist</span>
                <span>{booking.artist_display_name}</span>
              </div>
              <div className="wizard-review-row">
                <span>Current time</span>
                <span>{formatDateTime(booking.starts_at)}</span>
              </div>
              <div className="wizard-review-row wizard-review-row--total">
                <span>New time</span>
                <span>{slot ? formatDateTime(slot.startsAt) : "—"}</span>
              </div>
              <div className="wizard-review-row">
                <span>Duration</span>
                <span>
                  {hours} hr{hours !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="wizard-review-row">
                <span>Paid so far</span>
                <span>£{Number(booking.amount_paid).toFixed(2)}</span>
              </div>
            </div>

            <p className="settings-form__hint">
              The calendar will update automatically. Pricing is recalculated from the booked hourly rate.
            </p>

            {submitError && <p className="wizard-error">{submitError}</p>}

            <button
              className="wizard-primary-btn wizard-primary-btn--full"
              disabled={submitting || !slotChanged}
              onClick={() => void handleConfirm()}
            >
              {submitting ? "Rescheduling…" : "Confirm reschedule"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default RescheduleWizard;
