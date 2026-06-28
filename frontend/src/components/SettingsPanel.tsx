import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

interface SocialLinks {
  instagram: string;
  tiktok: string;
  facebook: string;
  twitter: string;
  website: string;
}

interface SettingsData {
  user: { id: number; email: string; name: string };
  artist: {
    id: number;
    displayName: string;
    bio: string | null;
    profileImageUrl: string | null;
    socialLinks: Partial<SocialLinks>;
  };
}

interface SettingsPanelProps {
  onClose: () => void;
  fullPage?: boolean;
}

type SettingsTab = "profile" | "security" | "social";

const EMPTY_SOCIAL: SocialLinks = {
  instagram: "",
  tiktok: "",
  facebook: "",
  twitter: "",
  website: "",
};

function socialFromApi(links: Partial<SocialLinks> | undefined): SocialLinks {
  return { ...EMPTY_SOCIAL, ...links };
}

function SettingsPanel({ onClose, fullPage = false }: SettingsPanelProps) {
  const { fetchWithAuth, user, updateUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [bio, setBio] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(EMPTY_SOCIAL);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");

  const applySettings = useCallback((data: SettingsData) => {
    setName(data.user.name);
    setEmail(data.user.email);
    setDisplayName(data.artist.displayName);
    setProfileImageUrl(data.artist.profileImageUrl ?? "");
    setBio(data.artist.bio ?? "");
    setSocialLinks(socialFromApi(data.artist.socialLinks));
    updateUser({ name: data.user.name, email: data.user.email });
  }, [updateUser]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/settings/me");
      if (!res.ok) {
        setError("Could not load settings");
        return;
      }
      const data = (await res.json()) as SettingsData;
      applySettings(data);
    } catch {
      setError("Could not load settings");
    } finally {
      setLoading(false);
    }
  }, [applySettings, fetchWithAuth]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const clearSecurityForms = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPin("");
    setNewPin("");
    setConfirmNewPin("");
  };

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth("/api/settings/me", {
        method: "PATCH",
        body: JSON.stringify({
          name,
          email,
          displayName,
          profileImageUrl: profileImageUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save profile");
        return;
      }
      const data = (await res.json()) as SettingsData;
      applySettings(data);
      showSuccess("Profile saved");
    } catch {
      setError("Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSocial = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth("/api/settings/me", {
        method: "PATCH",
        body: JSON.stringify({ bio, socialLinks }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save social profile");
        return;
      }
      const data = (await res.json()) as SettingsData;
      applySettings(data);
      showSuccess("Bio and social links saved");
    } catch {
      setError("Could not save social profile");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth("/api/auth/password/change", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not change password");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showSuccess("Password updated");
    } catch {
      setError("Could not change password");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePin = async () => {
    if (newPin !== confirmNewPin) {
      setError("New PINs do not match");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth("/api/auth/pin/change", {
        method: "POST",
        body: JSON.stringify({ currentPin, newPin, confirmNewPin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not change PIN");
        return;
      }
      setCurrentPin("");
      setNewPin("");
      setConfirmNewPin("");
      showSuccess("PIN updated");
    } catch {
      setError("Could not change PIN");
    } finally {
      setSaving(false);
    }
  };

  const updateSocial = (key: keyof SocialLinks, value: string) => {
    setSocialLinks((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className={fullPage ? "detail-screen detail-screen--settings" : "panel settings-panel"}>
      {fullPage ? (
        <>
          <header className="detail-screen__toolbar">
            <button type="button" className="detail-screen__back" onClick={onClose}>
              ← Back
            </button>
            <div className="detail-screen__title">
              <h2>Settings</h2>
              <p>Profile, security, and social links</p>
            </div>
          </header>

          {error ? <p className="detail-screen__alert permissions-panel__error">{error}</p> : null}
          {success ? <p className="detail-screen__alert settings-panel__success">{success}</p> : null}

          <div className="detail-screen__body detail-screen__body--settings">
            <nav className="detail-screen__nav" aria-label="Settings sections">
              <button
                type="button"
                className={`detail-screen__nav-item${activeTab === "profile" ? " detail-screen__nav-item--active" : ""}`}
                onClick={() => {
                  setActiveTab("profile");
                  setError(null);
                  setSuccess(null);
                }}
              >
                Profile
              </button>
              <button
                type="button"
                className={`detail-screen__nav-item${activeTab === "security" ? " detail-screen__nav-item--active" : ""}`}
                onClick={() => {
                  setActiveTab("security");
                  setError(null);
                  setSuccess(null);
                  clearSecurityForms();
                }}
              >
                Security
              </button>
              <button
                type="button"
                className={`detail-screen__nav-item${activeTab === "social" ? " detail-screen__nav-item--active" : ""}`}
                onClick={() => {
                  setActiveTab("social");
                  setError(null);
                  setSuccess(null);
                }}
              >
                Social &amp; bio
              </button>
            </nav>

            <div className="detail-screen__main detail-screen__main--settings">
              {loading ? (
                <p className="permissions-panel__loading">Loading…</p>
              ) : activeTab === "profile" ? (
                <div className="settings-form settings-form--wide">
                  <div className="settings-form__section">
                    <h3>Account</h3>
                    <label className="settings-field">
                      <span>Name</span>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
                    </label>
                    <label className="settings-field">
                      <span>Email</span>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </label>
                  </div>

                  <div className="settings-form__section">
                    <h3>Public profile</h3>
                    <label className="settings-field">
                      <span>Display name</span>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="How clients see you on bookings"
                      />
                    </label>
                    <label className="settings-field">
                      <span>Profile photo URL</span>
                      <input
                        type="url"
                        value={profileImageUrl}
                        onChange={(e) => setProfileImageUrl(e.target.value)}
                        placeholder="https://…"
                      />
                    </label>
                    {profileImageUrl.trim() ? (
                      <div className="settings-avatar-preview">
                        <img src={profileImageUrl.trim()} alt="" />
                      </div>
                    ) : null}
                  </div>

                  <div className="settings-form__actions">
                    <button
                      className="permissions-panel__save"
                      onClick={() => void handleSaveProfile()}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save profile"}
                    </button>
                  </div>
                </div>
              ) : activeTab === "security" ? (
                <div className="settings-form settings-form--wide">
                  <div className="settings-form__section">
                    <h3>Change password</h3>
                    <p className="settings-form__hint">Signed in as {user?.email}</p>
                    <label className="settings-field">
                      <span>Current password</span>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                    </label>
                    <label className="settings-field">
                      <span>New password</span>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                    <label className="settings-field">
                      <span>Confirm new password</span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                    <button
                      className="permissions-panel__save"
                      onClick={() => void handleChangePassword()}
                      disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                    >
                      {saving ? "Updating…" : "Update password"}
                    </button>
                  </div>

                  {!user?.pinRequired ? (
                    <div className="settings-form__section">
                      <h3>Change PIN</h3>
                      <p className="settings-form__hint">Your 6-digit code for unlocking the app</p>
                      <label className="settings-field">
                        <span>Current PIN</span>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={currentPin}
                          onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          autoComplete="off"
                        />
                      </label>
                      <label className="settings-field">
                        <span>New PIN</span>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          autoComplete="off"
                        />
                      </label>
                      <label className="settings-field">
                        <span>Confirm new PIN</span>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={confirmNewPin}
                          onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          autoComplete="off"
                        />
                      </label>
                      <button
                        className="permissions-panel__save"
                        onClick={() => void handleChangePin()}
                        disabled={
                          saving || currentPin.length !== 6 || newPin.length !== 6 || confirmNewPin.length !== 6
                        }
                      >
                        {saving ? "Updating…" : "Update PIN"}
                      </button>
                    </div>
                  ) : null}

                  <div className="settings-form__section settings-form__section--danger settings-form__section--span">
                    <h3>Sign out</h3>
                    <p className="settings-form__hint">End your session on this device</p>
                    <button type="button" className="settings-panel__logout" onClick={logout}>
                      Sign out
                    </button>
                  </div>
                </div>
              ) : activeTab === "social" ? (
                <div className="settings-form settings-form--wide">
                  <div className="settings-form__section settings-form__section--span">
                    <h3>Bio</h3>
                    <p className="settings-form__hint">Tell clients about your style and experience</p>
                    <label className="settings-field">
                      <span>Bio</span>
                      <textarea
                        rows={5}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Specialities, years of experience, favourite styles…"
                      />
                    </label>
                  </div>

                  <div className="settings-form__section settings-form__section--links">
                    <h3>Social links</h3>
                    <p className="settings-form__hint">Paste full profile URLs</p>
                    <label className="settings-field">
                      <span>Instagram</span>
                      <input
                        type="url"
                        value={socialLinks.instagram}
                        onChange={(e) => updateSocial("instagram", e.target.value)}
                        placeholder="https://instagram.com/…"
                      />
                    </label>
                    <label className="settings-field">
                      <span>TikTok</span>
                      <input
                        type="url"
                        value={socialLinks.tiktok}
                        onChange={(e) => updateSocial("tiktok", e.target.value)}
                        placeholder="https://tiktok.com/@…"
                      />
                    </label>
                    <label className="settings-field">
                      <span>Facebook</span>
                      <input
                        type="url"
                        value={socialLinks.facebook}
                        onChange={(e) => updateSocial("facebook", e.target.value)}
                        placeholder="https://facebook.com/…"
                      />
                    </label>
                    <label className="settings-field">
                      <span>X / Twitter</span>
                      <input
                        type="url"
                        value={socialLinks.twitter}
                        onChange={(e) => updateSocial("twitter", e.target.value)}
                        placeholder="https://x.com/…"
                      />
                    </label>
                    <label className="settings-field">
                      <span>Website</span>
                      <input
                        type="url"
                        value={socialLinks.website}
                        onChange={(e) => updateSocial("website", e.target.value)}
                        placeholder="https://…"
                      />
                    </label>
                  </div>

                  <div className="settings-form__actions">
                    <button
                      className="permissions-panel__save"
                      onClick={() => void handleSaveSocial()}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save bio & social links"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <>
      <header className="panel-intro">
        <div className="panel-intro__content">
          <div className="panel-intro__heading">
            <h2>Settings</h2>
            <p className="panel__subtitle">Manage your profile, security, and social presence</p>
          </div>

          <div className="permissions-panel__tabs">
            <button
              className={`permissions-panel__tab${activeTab === "profile" ? " permissions-panel__tab--active" : ""}`}
              onClick={() => {
                setActiveTab("profile");
                setError(null);
                setSuccess(null);
              }}
            >
              Profile
            </button>
            <button
              className={`permissions-panel__tab${activeTab === "security" ? " permissions-panel__tab--active" : ""}`}
              onClick={() => {
                setActiveTab("security");
                setError(null);
                setSuccess(null);
                clearSecurityForms();
              }}
            >
              Security
            </button>
            <button
              className={`permissions-panel__tab${activeTab === "social" ? " permissions-panel__tab--active" : ""}`}
              onClick={() => {
                setActiveTab("social");
                setError(null);
                setSuccess(null);
              }}
            >
              Social &amp; bio
            </button>
          </div>
        </div>

        <button
          className={`panel-intro__action ${fullPage ? "settings-page__back" : "permissions-panel__close"}`}
          onClick={onClose}
          aria-label={fullPage ? "Back" : "Close"}
        >
          {fullPage ? "← Back" : "×"}
        </button>
      </header>

      {error ? <p className="permissions-panel__error">{error}</p> : null}
      {success ? <p className="settings-panel__success">{success}</p> : null}

      {loading ? (
        <p className="permissions-panel__loading">Loading…</p>
      ) : activeTab === "profile" ? (
        <div className="settings-form">
          <div className="settings-form__section">
            <h3>Account</h3>
            <label className="settings-field">
              <span>Name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="settings-field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>

          <div className="settings-form__section">
            <h3>Public profile</h3>
            <label className="settings-field">
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How clients see you on bookings"
              />
            </label>
            <label className="settings-field">
              <span>Profile photo URL</span>
              <input
                type="url"
                value={profileImageUrl}
                onChange={(e) => setProfileImageUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            {profileImageUrl.trim() ? (
              <div className="settings-avatar-preview">
                <img src={profileImageUrl.trim()} alt="" />
              </div>
            ) : null}
          </div>

          <button
            className="permissions-panel__save"
            onClick={() => void handleSaveProfile()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      ) : activeTab === "security" ? (
        <div className="settings-form">
          <div className="settings-form__section">
            <h3>Change password</h3>
            <p className="settings-form__hint">Signed in as {user?.email}</p>
            <label className="settings-field">
              <span>Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label className="settings-field">
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="settings-field">
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button
              className="permissions-panel__save"
              onClick={() => void handleChangePassword()}
              disabled={saving || !currentPassword || !newPassword || !confirmPassword}
            >
              {saving ? "Updating…" : "Update password"}
            </button>
          </div>

          {!user?.pinRequired ? (
            <div className="settings-form__section">
              <h3>Change PIN</h3>
              <p className="settings-form__hint">Your 6-digit code for unlocking the app</p>
              <label className="settings-field">
                <span>Current PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="off"
                />
              </label>
              <label className="settings-field">
                <span>New PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="off"
                />
              </label>
              <label className="settings-field">
                <span>Confirm new PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="off"
                />
              </label>
              <button
                className="permissions-panel__save"
                onClick={() => void handleChangePin()}
                disabled={saving || currentPin.length !== 6 || newPin.length !== 6 || confirmNewPin.length !== 6}
              >
                {saving ? "Updating…" : "Update PIN"}
              </button>
            </div>
          ) : null}

          <div className="settings-form__section settings-form__section--danger">
            <h3>Sign out</h3>
            <p className="settings-form__hint">End your session on this device</p>
            <button type="button" className="settings-panel__logout" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <div className="settings-form">
          <div className="settings-form__section">
            <h3>Bio</h3>
            <p className="settings-form__hint">Tell clients about your style and experience</p>
            <label className="settings-field">
              <span>Bio</span>
              <textarea
                rows={5}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Specialities, years of experience, favourite styles…"
              />
            </label>
          </div>

          <div className="settings-form__section">
            <h3>Social links</h3>
            <p className="settings-form__hint">Paste full profile URLs — shown on your public profile</p>
            <label className="settings-field">
              <span>Instagram</span>
              <input
                type="url"
                value={socialLinks.instagram}
                onChange={(e) => updateSocial("instagram", e.target.value)}
                placeholder="https://instagram.com/…"
              />
            </label>
            <label className="settings-field">
              <span>TikTok</span>
              <input
                type="url"
                value={socialLinks.tiktok}
                onChange={(e) => updateSocial("tiktok", e.target.value)}
                placeholder="https://tiktok.com/@…"
              />
            </label>
            <label className="settings-field">
              <span>Facebook</span>
              <input
                type="url"
                value={socialLinks.facebook}
                onChange={(e) => updateSocial("facebook", e.target.value)}
                placeholder="https://facebook.com/…"
              />
            </label>
            <label className="settings-field">
              <span>X / Twitter</span>
              <input
                type="url"
                value={socialLinks.twitter}
                onChange={(e) => updateSocial("twitter", e.target.value)}
                placeholder="https://x.com/…"
              />
            </label>
            <label className="settings-field">
              <span>Website</span>
              <input
                type="url"
                value={socialLinks.website}
                onChange={(e) => updateSocial("website", e.target.value)}
                placeholder="https://…"
              />
            </label>
          </div>

          <button
            className="permissions-panel__save"
            onClick={() => void handleSaveSocial()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save bio & social links"}
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default SettingsPanel;
