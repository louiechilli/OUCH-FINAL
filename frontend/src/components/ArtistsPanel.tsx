import { useCallback, useEffect, useState } from "react";
import { useAuth, useIsAdmin } from "../auth/AuthContext";

interface Artist {
  id: number;
  userId: number;
  displayName: string;
  bio: string | null;
  profileImageUrl: string | null;
  googleCalendarId: string | null;
  defaultHourlyRate: number | null;
  isActive: boolean;
  email: string;
  isAdmin: boolean;
}

interface ArtistForm {
  email: string;
  displayName: string;
  bio: string;
  googleCalendarId: string;
  defaultHourlyRate: string;
  isActive: boolean;
  isAdmin: boolean;
}

const EMPTY_FORM: ArtistForm = {
  email: "",
  displayName: "",
  bio: "",
  googleCalendarId: "",
  defaultHourlyRate: "",
  isActive: true,
  isAdmin: false,
};

function toForm(artist: Artist): ArtistForm {
  return {
    email: artist.email,
    displayName: artist.displayName,
    bio: artist.bio ?? "",
    googleCalendarId: artist.googleCalendarId ?? "",
    defaultHourlyRate: artist.defaultHourlyRate === null ? "" : String(artist.defaultHourlyRate),
    isActive: artist.isActive,
    isAdmin: artist.isAdmin,
  };
}

interface ArtistsPanelProps {
  onClose?: () => void;
  embedded?: boolean;
}

function ArtistsPanel({ onClose, embedded = false }: ArtistsPanelProps) {
  const { fetchWithAuth } = useAuth();
  const isAdmin = useIsAdmin();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<ArtistForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const loadArtists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/artists/admin");
      if (res.status === 403) {
        setError("Admin access required");
        return;
      }
      if (!res.ok) throw new Error("Could not load artists");
      setArtists(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    if (isAdmin) loadArtists();
  }, [isAdmin, loadArtists]);

  function selectArtist(artist: Artist) {
    setSelectedId(artist.id);
    setForm(toForm(artist));
    setError(null);
    setSuccess(null);
    setTemporaryPassword(null);
  }

  function startNewArtist() {
    setSelectedId("new");
    setForm(EMPTY_FORM);
    setError(null);
    setSuccess(null);
    setTemporaryPassword(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const hourlyRate = form.defaultHourlyRate.trim() === "" ? null : Number(form.defaultHourlyRate);
    if (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
      setError("Default hourly rate must be a positive number");
      setSaving(false);
      return;
    }

    try {
      if (selectedId === "new") {
        if (!form.email.trim() || !form.displayName.trim()) {
          setError("Email and display name are required");
          setSaving(false);
          return;
        }
        const res = await fetchWithAuth("/api/artists/admin", {
          method: "POST",
          body: JSON.stringify({
            email: form.email.trim(),
            displayName: form.displayName.trim(),
            bio: form.bio.trim() || undefined,
            googleCalendarId: form.googleCalendarId.trim() || undefined,
            defaultHourlyRate: hourlyRate,
            isAdmin: form.isAdmin,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Could not create artist");
        }
        const data = await res.json();
        setTemporaryPassword(data.temporaryPassword);
        setSuccess(`${data.artist.displayName} created`);
        await loadArtists();
        selectArtistById(data.artist.id);
      } else if (selectedId !== null) {
        const res = await fetchWithAuth(`/api/artists/admin/${selectedId}`, {
          method: "PATCH",
          body: JSON.stringify({
            displayName: form.displayName.trim(),
            bio: form.bio.trim() || null,
            googleCalendarId: form.googleCalendarId.trim() || null,
            defaultHourlyRate: hourlyRate,
            isActive: form.isActive,
            isAdmin: form.isAdmin,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Could not save artist");
        }
        setSuccess("Saved");
        await loadArtists();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function selectArtistById(id: number) {
    setSelectedId(id);
  }

  async function handleDeactivate(artist: Artist) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/artists/admin/${artist.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not deactivate artist");
      setSuccess(`${artist.displayName} deactivated`);
      await loadArtists();
      if (selectedId === artist.id) setSelectedId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>Access denied</h2>
            <p className="panel__subtitle">Admin access is required to manage artists.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "settings-embedded-panel catalog-panel" : "panel catalog-panel"}>
      {embedded ? (
        <div className="settings-embedded-panel__header">
          <h3>Artists</h3>
          <p className="panel__subtitle">Manage staff accounts, rates and Google Calendar links</p>
        </div>
      ) : (
        <header className="panel-intro">
          <div className="panel-intro__content">
            <div className="panel-intro__heading">
              <h2>Artists</h2>
              <p className="panel__subtitle">Manage staff accounts, rates and Google Calendar links</p>
            </div>
          </div>
          <button className="panel-intro__action permissions-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
      )}

      {error ? <p className="permissions-panel__error">{error}</p> : null}
      {success ? <p className="settings-panel__success">{success}</p> : null}
      {temporaryPassword ? (
        <p className="settings-panel__success">
          Temporary password: <strong>{temporaryPassword}</strong> — share this with the artist now,
          it will not be shown again.
        </p>
      ) : null}

      {loading ? (
        <p className="permissions-panel__loading">Loading…</p>
      ) : (
        <div className="catalog-layout">
          <div className="catalog-list">
            <div className="catalog-list__header">
              <h3>All artists</h3>
              <button type="button" className="catalog-list__add" onClick={startNewArtist}>
                + Add
              </button>
            </div>
            {artists.length === 0 ? (
              <p className="catalog-list__empty">No artists yet — add your first one.</p>
            ) : (
              <ul>
                {artists.map((artist) => (
                  <li key={artist.id}>
                    <button
                      type="button"
                      className={`catalog-list__item${
                        selectedId === artist.id ? " catalog-list__item--selected" : ""
                      }`}
                      onClick={() => selectArtist(artist)}
                    >
                      <span className="catalog-list__item-name">{artist.displayName}</span>
                      <span className="catalog-list__item-meta">
                        {artist.email}
                        {artist.isAdmin ? " · Admin" : ""}
                        {!artist.isActive ? " · Inactive" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="catalog-editor">
            {selectedId === null ? (
              <p className="catalog-editor__placeholder">Select an artist to edit, or add a new one.</p>
            ) : (
              <div className="settings-form">
                <div className="settings-form__section">
                  <h3>{selectedId === "new" ? "New artist" : "Edit artist"}</h3>

                  <label className="settings-field">
                    <span>Display name</span>
                    <input
                      type="text"
                      value={form.displayName}
                      onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                      placeholder="e.g. Sarah"
                    />
                  </label>

                  {selectedId === "new" ? (
                    <label className="settings-field">
                      <span>Email (used to log in)</span>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="sarah@ouchtattoostudio.com"
                      />
                    </label>
                  ) : (
                    <label className="settings-field">
                      <span>Email</span>
                      <input type="email" value={form.email} disabled />
                    </label>
                  )}

                  <label className="settings-field">
                    <span>Bio</span>
                    <textarea
                      rows={3}
                      value={form.bio}
                      onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                      placeholder="Optional"
                    />
                  </label>

                  <label className="settings-field">
                    <span>Google Calendar ID</span>
                    <input
                      type="text"
                      value={form.googleCalendarId}
                      onChange={(e) => setForm((f) => ({ ...f, googleCalendarId: e.target.value }))}
                      placeholder="sarah@ouchtattoostudio.com or calendar id"
                    />
                  </label>

                  <label className="settings-field">
                    <span>Default hourly rate (£)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.defaultHourlyRate}
                      onChange={(e) => setForm((f) => ({ ...f, defaultHourlyRate: e.target.value }))}
                      placeholder="Optional fallback rate"
                    />
                  </label>

                  <label className="catalog-toggle">
                    <input
                      type="checkbox"
                      checked={form.isAdmin}
                      onChange={(e) => setForm((f) => ({ ...f, isAdmin: e.target.checked }))}
                    />
                    <span>Admin access</span>
                  </label>

                  {selectedId !== "new" && (
                    <label className="catalog-toggle">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                      />
                      <span>Active</span>
                    </label>
                  )}

                  <button className="permissions-panel__save" onClick={() => void handleSave()} disabled={saving}>
                    {saving ? "Saving…" : selectedId === "new" ? "Create artist" : "Save artist"}
                  </button>

                  {selectedId !== "new" && form.isActive && (
                    <button
                      className="settings-panel__logout"
                      onClick={() => {
                        const artist = artists.find((a) => a.id === selectedId);
                        if (artist) void handleDeactivate(artist);
                      }}
                      disabled={saving}
                    >
                      Deactivate artist
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ArtistsPanel;
