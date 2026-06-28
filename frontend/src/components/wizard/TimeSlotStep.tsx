import { useEffect, useState } from "react";
import type { ArtistOption, BookingSlot } from "../../pages/NewBookingWizard";
import { STUDIO_TIMEZONE, studioDateKey } from "../../lib/timezone";

interface TimeSlotStepProps {
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>;
  artist: ArtistOption;
  hours: number;
  initialDate?: string;
  initialSlot?: BookingSlot;
  excludeBookingId?: number;
  onContinue: (date: string, slot: BookingSlot) => void;
}

function TimeSlotStep({
  fetchWithAuth,
  artist,
  hours,
  initialDate,
  initialSlot,
  excludeBookingId,
  onContinue,
}: TimeSlotStepProps) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() + i);
    return day;
  });

  const [date, setDate] = useState(initialDate ?? studioDateKey(days[0]));
  const [slots, setSlots] = useState<BookingSlot[] | null>(null);
  const [selected, setSelected] = useState<BookingSlot | undefined>(initialSlot);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSlots(null);
    setError(null);
    const params = new URLSearchParams({
      artistId: String(artist.id),
      date,
      hours: String(hours),
    });
    if (excludeBookingId) params.set("excludeBookingId", String(excludeBookingId));
    fetchWithAuth(`/api/availability?${params.toString()}`)
      .then((res) => res.json())
      .then(setSlots)
      .catch(() => setError("Could not load availability"));
  }, [artist.id, date, hours, excludeBookingId, fetchWithAuth]);

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: STUDIO_TIMEZONE,
    });
  }

  return (
    <div className="wizard-step">
      <div className="wizard-day-strip">
        {days.map((day) => {
          const key = studioDateKey(day);
          return (
            <button
              key={key}
              className={`wizard-day ${date === key ? "wizard-day--selected" : ""}`}
              onClick={() => {
                setDate(key);
                setSelected(undefined);
              }}
            >
              <span className="wizard-day__name">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span className="wizard-day__num">{day.getDate()}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="wizard-error">{error}</p>}
      {!slots && !error && <div className="wizard-loading">Checking availability…</div>}
      {slots && slots.length === 0 && (
        <p className="wizard-empty">No availability on this day for that duration.</p>
      )}

      <div className="wizard-slot-grid">
        {slots?.map((slot) => (
          <button
            key={slot.startsAt}
            className={`wizard-slot ${selected?.startsAt === slot.startsAt ? "wizard-slot--selected" : ""}`}
            onClick={() => setSelected(slot)}
          >
            {formatTime(slot.startsAt)}
          </button>
        ))}
      </div>

      <button
        className="wizard-primary-btn wizard-primary-btn--full"
        disabled={!selected}
        onClick={() => selected && onContinue(date, selected)}
      >
        Continue
      </button>
    </div>
  );
}

export default TimeSlotStep;
