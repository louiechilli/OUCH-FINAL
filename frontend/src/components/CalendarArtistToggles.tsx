import { useState, type CSSProperties } from "react";
import { artistCalendarColor } from "../lib/calendarUtils";

interface ArtistOption {
  id: number;
  displayName: string;
}

interface CalendarArtistTogglesProps {
  artists: ArtistOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  loading?: boolean;
}

function CalendarArtistToggles({
  artists,
  selectedIds,
  onChange,
  loading = false,
}: CalendarArtistTogglesProps) {
  const [open, setOpen] = useState(true);
  const selectedSet = new Set(selectedIds);

  const toggleArtist = (artistId: number) => {
    if (selectedSet.has(artistId)) {
      onChange(selectedIds.filter((id) => id !== artistId));
      return;
    }
    onChange([...selectedIds, artistId]);
  };

  return (
    <section className="gcal-artist-list" aria-label="Artist calendars">
      <button
        type="button"
        className="gcal-artist-list__header"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Artists</span>
        <span className={`gcal-artist-list__chevron${open ? " gcal-artist-list__chevron--open" : ""}`} aria-hidden="true">
          ›
        </span>
      </button>

      {open ? (
        <ul className="gcal-artist-list__items">
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <li key={index} className="gcal-artist-toggle gcal-artist-toggle--skeleton" aria-hidden="true">
                  <span className="gcal-skeleton gcal-artist-toggle__box-skeleton" />
                  <span className="gcal-skeleton gcal-artist-toggle__label-skeleton" />
                </li>
              ))
            : artists.map((artist) => {
                const checked = selectedSet.has(artist.id);
                const color = artistCalendarColor(artist.id);
                return (
                  <li key={artist.id}>
                    <label className="gcal-artist-toggle">
                      <input
                        type="checkbox"
                        className="gcal-artist-toggle__input"
                        checked={checked}
                        onChange={() => toggleArtist(artist.id)}
                      />
                      <span
                        className={`gcal-artist-toggle__box${checked ? " gcal-artist-toggle__box--checked" : ""}`}
                        style={{ "--gcal-artist-color": color.bg } as CSSProperties}
                        aria-hidden="true"
                      >
                        {checked ? (
                          <svg viewBox="0 0 12 10" className="gcal-artist-toggle__check" aria-hidden="true">
                            <path d="M1 5.2 4.2 8.4 11 1.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                          </svg>
                        ) : null}
                      </span>
                      <span className="gcal-artist-toggle__label">{artist.displayName}</span>
                    </label>
                  </li>
                );
              })}
        </ul>
      ) : null}
    </section>
  );
}

export default CalendarArtistToggles;
