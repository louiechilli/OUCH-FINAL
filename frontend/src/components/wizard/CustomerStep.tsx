import { useEffect, useState } from "react";
import type { ClientOption } from "../../pages/NewBookingWizard";

interface CustomerStepProps {
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>;
  onSelect: (client: ClientOption) => void;
}

function CustomerStep({ fetchWithAuth, onSelect }: CustomerStepProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchWithAuth(`/api/clients?search=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then(setResults)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [query, fetchWithAuth]);

  async function handleCreate() {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Could not create customer");
      const client = await res.json();
      onSelect(client);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  if (showCreate) {
    return (
      <div className="wizard-step">
        <div className="wizard-form">
          <label className="wizard-field">
            <span>First name</span>
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoFocus />
          </label>
          <label className="wizard-field">
            <span>Last name</span>
            <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
          <label className="wizard-field">
            <span>Phone</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              autoComplete="tel"
            />
          </label>
          <label className="wizard-field">
            <span>Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              inputMode="email"
              autoComplete="email"
            />
          </label>

          {error && <p className="wizard-error">{error}</p>}

          <div className="wizard-form-actions">
            <button className="wizard-secondary-btn" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button className="wizard-primary-btn" onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create & continue"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-step">
      <div className="wizard-search-bar">
        <span>⌕</span>
        <input
          placeholder="Search by name or phone…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
      </div>

      <div className="wizard-option-list">
        {results.map((client) => (
          <button key={client.id} className="wizard-list-row" onClick={() => onSelect(client)}>
            <span className="wizard-list-row__title">
              {client.first_name} {client.last_name}
            </span>
            <span className="wizard-list-row__meta">{client.phone ?? client.email ?? ""}</span>
          </button>
        ))}
        {query && results.length === 0 && <p className="wizard-empty">No matches for "{query}"</p>}
      </div>

      <button className="wizard-add-new" onClick={() => setShowCreate(true)}>
        + New customer
      </button>
    </div>
  );
}

export default CustomerStep;
