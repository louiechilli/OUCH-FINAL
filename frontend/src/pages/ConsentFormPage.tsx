import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import SignaturePad from "../components/SignaturePad";
import { STUDIO_TIMEZONE } from "../lib/timezone";

interface ConsentFieldDef {
  key: string;
  label: string;
  type: "yesno" | "textarea";
  required?: boolean;
}

interface ConsentTemplate {
  id: number;
  key: string;
  name: string;
  fields: ConsentFieldDef[];
  disclaimerText: string;
}

export interface ConsentFormBooking {
  id: number;
  client_first_name: string;
  client_last_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_date_of_birth: string | null;
  artist_display_name: string;
  requires_consent_form_id: number;
}

interface ConsentFormPageProps {
  booking: ConsentFormBooking;
  onClose: () => void;
  onSubmitted: () => void;
}

function ConsentFormPage({ booking, onClose, onSubmitted }: ConsentFormPageProps) {
  const { fetchWithAuth } = useAuth();
  const [template, setTemplate] = useState<ConsentTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState(`${booking.client_first_name} ${booking.client_last_name}`.trim());
  const [phone, setPhone] = useState(booking.client_phone ?? "");
  const [email, setEmail] = useState(booking.client_email ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(booking.client_date_of_birth ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [clientSignature, setClientSignature] = useState<string | null>(null);
  const [artistSignature, setArtistSignature] = useState<string | null>(null);

  useEffect(() => {
    fetchWithAuth(`/api/consent/templates/${booking.requires_consent_form_id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load consent form");
        return res.json();
      })
      .then((data: ConsentTemplate) => setTemplate(data))
      .catch(() => setError("Could not load this consent form"));
  }, [fetchWithAuth, booking.requires_consent_form_id]);

  const signedDate = new Date().toLocaleDateString(undefined, { timeZone: STUDIO_TIMEZONE });

  const requiredFieldsMissing =
    !fullName.trim() ||
    !template?.fields
      .filter((f) => f.required !== false && f.type === "yesno")
      .every((f) => answers[f.key] === "yes" || answers[f.key] === "no");

  const handleSubmit = async () => {
    if (!template) return;
    if (requiredFieldsMissing) {
      setError("Please answer every medical history question before signing.");
      return;
    }
    if (!clientSignature) {
      setError("The client's signature is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/consent/submissions", {
        method: "POST",
        body: JSON.stringify({
          bookingId: booking.id,
          templateId: template.id,
          answers: { fullName, phone, email, dateOfBirth, ...answers },
          clientSignature,
          artistSignature,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save consent form");
      }
      onSubmitted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bookings-page consent-page">
      <div className="panel__header">
        <button type="button" className="settings-page__back" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <div className="panel__header-content">
          <h2>{template?.name ?? "Consent form"}</h2>
          <p className="panel__subtitle">To be completed and signed by the client before the session</p>
        </div>
      </div>

      <div className="panel__scroll">
        {error && <p className="wizard-error">{error}</p>}

        {!template ? (
          <p className="wizard-loading">Loading…</p>
        ) : (
          <div className="consent-form">
            <div className="settings-form__section">
              <h3>Client details</h3>
              <div className="catalog-form__row">
                <label className="settings-field">
                  <span>Full name</span>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </label>
                <label className="settings-field">
                  <span>Date of birth</span>
                  <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                </label>
              </div>
              <div className="catalog-form__row">
                <label className="settings-field">
                  <span>Phone</span>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
                <label className="settings-field">
                  <span>Email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
              </div>
              <label className="settings-field">
                <span>Tattoo artist</span>
                <input type="text" value={booking.artist_display_name} disabled />
              </label>
            </div>

            <div className="settings-form__section">
              <h3>Medical history</h3>
              <p className="settings-form__hint">Do you suffer from, or have any of the following?</p>
              {template.fields.map((field) =>
                field.type === "yesno" ? (
                  <div className="consent-question" key={field.key}>
                    <span className="consent-question__label">{field.label}</span>
                    <div className="consent-question__options">
                      <label className="consent-radio">
                        <input
                          type="radio"
                          name={field.key}
                          checked={answers[field.key] === "yes"}
                          onChange={() => setAnswers((a) => ({ ...a, [field.key]: "yes" }))}
                        />
                        Yes
                      </label>
                      <label className="consent-radio">
                        <input
                          type="radio"
                          name={field.key}
                          checked={answers[field.key] === "no"}
                          onChange={() => setAnswers((a) => ({ ...a, [field.key]: "no" }))}
                        />
                        No
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="settings-field" key={field.key}>
                    <span>{field.label}</span>
                    <textarea
                      rows={2}
                      value={answers[field.key] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [field.key]: e.target.value }))}
                    />
                  </label>
                )
              )}
            </div>

            <div className="settings-form__section settings-form__section--danger">
              <h3>Disclaimer</h3>
              <p className="consent-disclaimer">{template.disclaimerText}</p>
            </div>

            <div className="settings-form__section">
              <h3>Signatures</h3>
              <SignaturePad label="Client signature" onChange={setClientSignature} />
              <p className="settings-form__hint">Signed {signedDate}</p>
              <SignaturePad label="Artist signature (optional, can be added later)" onChange={setArtistSignature} />
            </div>

            <button className="permissions-panel__save" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? "Saving…" : "Submit & file consent form"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConsentFormPage;
