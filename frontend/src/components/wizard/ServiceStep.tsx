import { useEffect, useState } from "react";
import type { ServiceOption } from "../../pages/NewBookingWizard";

interface Category {
  id: number;
  name: string;
  services: ServiceOption[];
}

interface ServiceStepProps {
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>;
  selected?: ServiceOption;
  onSelect: (service: ServiceOption) => void;
}

function ServiceStep({ fetchWithAuth, selected, onSelect }: ServiceStepProps) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithAuth("/api/catalog")
      .then((res) => res.json())
      .then(setCategories)
      .catch(() => setError("Could not load services"));
  }, [fetchWithAuth]);

  if (error) return <p className="wizard-error">{error}</p>;
  if (!categories) return <div className="wizard-loading">Loading services…</div>;
  if (categories.length === 0) return <p className="wizard-empty">No services configured yet.</p>;

  return (
    <div className="wizard-step">
      {categories.map((category) => (
        <div key={category.id} className="wizard-category">
          <h3 className="wizard-category__title">{category.name}</h3>
          <div className="wizard-option-grid">
            {category.services.map((service) => (
              <button
                key={service.id}
                className={`wizard-option ${selected?.id === service.id ? "wizard-option--selected" : ""}`}
                onClick={() => onSelect(service)}
              >
                <span className="wizard-option__title">{service.name}</span>
                <span className="wizard-option__meta">
                  {service.useArtistDefaultRate
                    ? "Artist hourly rate"
                    : service.defaultHourlyRate !== null && service.defaultHourlyRate > 0
                      ? `From £${service.defaultHourlyRate}/hr`
                      : "Free"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ServiceStep;
