import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import WizardHeader from "../components/wizard/WizardHeader";
import ServiceStep from "../components/wizard/ServiceStep";
import CustomerStep from "../components/wizard/CustomerStep";
import ArtistHoursStep from "../components/wizard/ArtistHoursStep";
import TimeSlotStep from "../components/wizard/TimeSlotStep";
import ReviewStep from "../components/wizard/ReviewStep";
import DepositStep from "../components/wizard/DepositStep";

export interface ServiceOption {
  id: number;
  name: string;
  minHours: number;
  maxHours: number | null;
  defaultHourlyRate: number | null;
  useArtistDefaultRate: boolean;
  depositAmount: number;
}

export interface ClientOption {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

export interface ArtistOption {
  id: number;
  displayName: string;
}

export interface ResolvedRate {
  hourlyRate: number;
  minHours: number;
  maxHours: number | null;
  depositAmount: number;
}

export interface BookingSlot {
  startsAt: string;
  endsAt: string;
}

export interface BookingDraft {
  service?: ServiceOption;
  client?: ClientOption;
  artist?: ArtistOption;
  hours?: number;
  rate?: ResolvedRate;
  date?: string;
  slot?: BookingSlot;
  notes?: string;
}

interface CreatedBooking {
  id: number;
  deposit_amount: string;
}

type Step = "service" | "customer" | "artist-hours" | "time" | "review";
const STEPS: Step[] = ["service", "customer", "artist-hours", "time", "review"];
const STEP_TITLES: Record<Step, string> = {
  service: "Select a service",
  customer: "Select customer",
  "artist-hours": "Artist & duration",
  time: "Pick a time",
  review: "Confirm booking",
};

interface NewBookingWizardProps {
  onClose: () => void;
  onCreated: () => void;
}

function NewBookingWizard({ onClose, onCreated }: NewBookingWizardProps) {
  const { fetchWithAuth } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [draft, setDraft] = useState<BookingDraft>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdBooking, setCreatedBooking] = useState<CreatedBooking | null>(null);

  const step = STEPS[stepIndex];
  const depositDue = createdBooking ? Number(createdBooking.deposit_amount) : 0;
  const collectingDeposit = createdBooking !== null && depositDue > 0;

  function goNext(patch?: Partial<BookingDraft>) {
    if (patch) setDraft((current) => ({ ...current, ...patch }));
    setDirection("forward");
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  }

  function goBack() {
    if (collectingDeposit) return;
    if (stepIndex === 0) {
      onClose();
      return;
    }
    setDirection("back");
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  async function handleConfirm() {
    if (!draft.service || !draft.client || !draft.artist || !draft.slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          artistId: draft.artist.id,
          clientId: draft.client.id,
          serviceId: draft.service.id,
          startsAt: draft.slot.startsAt,
          endsAt: draft.slot.endsAt,
          clientNotes: draft.notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not create booking");
      }
      const booking = (await res.json()) as CreatedBooking;
      const deposit = Number(booking.deposit_amount);
      if (deposit > 0) {
        setCreatedBooking(booking);
      } else {
        onCreated();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const clientName = draft.client
    ? `${draft.client.first_name} ${draft.client.last_name}`
    : "";

  return (
    <div className="wizard-screen">
      <WizardHeader
        title={collectingDeposit ? "Collect deposit" : STEP_TITLES[step]}
        stepIndex={collectingDeposit ? STEPS.length : stepIndex}
        stepCount={collectingDeposit ? STEPS.length + 1 : STEPS.length}
        onBack={goBack}
      />
      <div className={`wizard-body wizard-body--${direction}`} key={collectingDeposit ? "deposit" : step}>
        {collectingDeposit && createdBooking ? (
          <DepositStep
            bookingId={createdBooking.id}
            depositAmount={depositDue}
            clientName={clientName}
            fetchWithAuth={fetchWithAuth}
            onComplete={onCreated}
          />
        ) : step === "service" ? (
          <ServiceStep
            fetchWithAuth={fetchWithAuth}
            selected={draft.service}
            onSelect={(service) => goNext({ service, hours: undefined, rate: undefined })}
          />
        ) : step === "customer" ? (
          <CustomerStep fetchWithAuth={fetchWithAuth} onSelect={(client) => goNext({ client })} />
        ) : step === "artist-hours" && draft.service ? (
          <ArtistHoursStep
            fetchWithAuth={fetchWithAuth}
            service={draft.service}
            initialArtist={draft.artist}
            initialHours={draft.hours}
            onContinue={(artist, hours, rate) => goNext({ artist, hours, rate, slot: undefined })}
          />
        ) : step === "time" && draft.artist && draft.hours ? (
          <TimeSlotStep
            fetchWithAuth={fetchWithAuth}
            artist={draft.artist}
            hours={draft.hours}
            initialDate={draft.date}
            initialSlot={draft.slot}
            onContinue={(date, slot) => goNext({ date, slot })}
          />
        ) : (
          <ReviewStep
            draft={draft}
            submitting={submitting}
            error={error}
            onNotesChange={(notes) => setDraft((current) => ({ ...current, notes }))}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
}

export default NewBookingWizard;
