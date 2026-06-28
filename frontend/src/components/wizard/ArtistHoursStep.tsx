import { useEffect, useState } from "react";
import type { ArtistOption, ResolvedRate, ServiceOption } from "../../pages/NewBookingWizard";

interface ArtistHoursStepProps {
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>;
  service: ServiceOption;
  initialArtist?: ArtistOption;
  initialHours?: number;
  onContinue: (artist: ArtistOption, hours: number, rate: ResolvedRate) => void;
}

const HOUR_STEP = 0.5;

function ArtistHoursStep({
  fetchWithAuth,
  service,
  initialArtist,
  initialHours,
  onContinue,
}: ArtistHoursStepProps) {
  const [artist, setArtist] = useState<ArtistOption | undefined>(initialArtist);
  const [artists, setArtists] = useState<ArtistOption[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [rate, setRate] = useState<ResolvedRate | null>(null);
  const [hours, setHours] = useState(initialHours ?? service.minHours);
  const [error, setError] = useState<string | null>(null);

  // Default to "booking for myself" — every account is an artist account —
  // until the user explicitly switches.
  useEffect(() => {
    if (artist) return;
    fetchWithAuth("/api/artists/me")
      .then((res) => res.json())
      .then(setArtist)
      .catch(() => {});
  }, [artist, fetchWithAuth]);

  useEffect(() => {
    if (!artist) return;
    setError(null);
    setRate(null);
    fetchWithAuth(`/api/artists/${artist.id}/services/${service.id}/rate`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "This artist doesn't offer this service");
        }
        return res.json();
      })
      .then((resolved: ResolvedRate) => {
        setRate(resolved);
        setHours((current) => {
          const min = resolved.minHours;
          const max = resolved.maxHours ?? Math.max(current, min);
          return Math.min(Math.max(current, min), max);
        });
      })
      .catch((err) => setError(err.message));
  }, [artist, service.id, fetchWithAuth]);

  function openPicker() {
    setShowPicker(true);
    if (!artists) {
      fetchWithAuth("/api/artists")
        .then((res) => res.json())
        .then(setArtists)
        .catch(() => {});
    }
  }

  const min = rate?.minHours ?? service.minHours;
  const max = rate?.maxHours ?? service.maxHours ?? min + 8;

  if (showPicker) {
    return (
      <div className="wizard-step">
        <div className="wizard-option-list">
          {(artists ?? []).map((option) => (
            <button
              key={option.id}
              className="wizard-list-row"
              onClick={() => {
                setArtist(option);
                setShowPicker(false);
              }}
            >
              <span className="wizard-list-row__title">{option.displayName}</span>
            </button>
          ))}
          {artists && artists.length === 0 && <p className="wizard-empty">No artists found.</p>}
        </div>
        <button className="wizard-secondary-btn" onClick={() => setShowPicker(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="wizard-step">
      <div className="wizard-artist-card">
        <div>
          <span className="wizard-artist-card__label">Artist</span>
          <span className="wizard-artist-card__name">{artist?.displayName ?? "…"}</span>
        </div>
        <button className="wizard-link-btn" onClick={openPicker}>
          Change
        </button>
      </div>

      {error && <p className="wizard-error">{error}</p>}

      <div className="wizard-hours-card">
        <span className="wizard-hours-card__label">Duration</span>
        <div className="wizard-hours-stepper">
          <button
            type="button"
            onClick={() => setHours((current) => Math.max(min, current - HOUR_STEP))}
            disabled={hours <= min}
          >
            −
          </button>
          <span className="wizard-hours-value">
            {hours} hr{hours !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => setHours((current) => Math.min(max, current + HOUR_STEP))}
            disabled={hours >= max}
          >
            +
          </button>
        </div>
        {rate && (
          <p className="wizard-price-preview">
            {rate.hourlyRate > 0
              ? `£${(rate.hourlyRate * hours).toFixed(2)} (£${rate.hourlyRate}/hr)`
              : "No charge"}
          </p>
        )}
      </div>

      <button
        className="wizard-primary-btn wizard-primary-btn--full"
        disabled={!artist || !rate}
        onClick={() => artist && rate && onContinue(artist, hours, rate)}
      >
        Continue
      </button>
    </div>
  );
}

export default ArtistHoursStep;
