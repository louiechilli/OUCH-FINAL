import { useCallback, useEffect, useState } from "react";
import { useAuth, useIsAdmin } from "../auth/AuthContext";

interface CatalogService {
  id: number;
  categoryId: number;
  name: string;
  slug: string;
  description: string | null;
  minHours: number;
  maxHours: number | null;
  defaultHourlyRate: number | null;
  useArtistDefaultRate: boolean;
  depositAmount: number;
  isActive: boolean;
  requiresConsentFormId: number | null;
}

function serviceRateLabel(
  service: Pick<CatalogService, "useArtistDefaultRate" | "defaultHourlyRate" | "depositAmount">
) {
  if (service.useArtistDefaultRate) return "Per-artist rate";
  if (service.defaultHourlyRate !== null && service.defaultHourlyRate > 0) {
    return `£${service.defaultHourlyRate}/hr`;
  }
  if (service.depositAmount > 0) return `£${service.depositAmount} deposit`;
  return "Free";
}

interface ConsentTemplateOption {
  id: number;
  name: string;
}

interface CatalogCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  services: CatalogService[];
}

interface CatalogPanelProps {
  onClose: () => void;
}

type CatalogTab = "categories" | "services";

const EMPTY_CATEGORY = {
  name: "",
  slug: "",
  description: "",
  sortOrder: "0",
  isActive: true,
};

const EMPTY_SERVICE = {
  categoryId: "",
  name: "",
  slug: "",
  description: "",
  minHours: "1",
  maxHours: "",
  defaultHourlyRate: "",
  useArtistDefaultRate: false,
  depositAmount: "0",
  isActive: true,
  requiresConsentFormId: "" as string,
};

function CatalogPanel({ onClose }: CatalogPanelProps) {
  const { fetchWithAuth } = useAuth();
  const isAdmin = useIsAdmin();
  const [activeTab, setActiveTab] = useState<CatalogTab>("categories");
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "new" | null>(null);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY);

  const [selectedServiceId, setSelectedServiceId] = useState<number | "new" | null>(null);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [consentTemplates, setConsentTemplates] = useState<ConsentTemplateOption[]>([]);

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/catalog/manage");
      if (res.status === 403) {
        setError("Admin access required");
        return;
      }
      if (!res.ok) {
        setError("Could not load catalog");
        return;
      }
      const data = (await res.json()) as { categories: CatalogCategory[] };
      setCategories(data.categories);
    } catch {
      setError("Could not load catalog");
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadCatalog();
    fetchWithAuth("/api/consent/templates")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ConsentTemplateOption[]) => setConsentTemplates(data))
      .catch(() => setConsentTemplates([]));
  }, [isAdmin, loadCatalog, fetchWithAuth]);

  const allServices = categories.flatMap((category) =>
    category.services.map((service) => ({ ...service, categoryName: category.name }))
  );

  const selectCategory = (category: CatalogCategory) => {
    setSelectedCategoryId(category.id);
    setCategoryForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
      sortOrder: String(category.sortOrder),
      isActive: category.isActive,
    });
    setError(null);
    setSuccess(null);
  };

  const startNewCategory = () => {
    setSelectedCategoryId("new");
    setCategoryForm(EMPTY_CATEGORY);
    setError(null);
    setSuccess(null);
  };

  const selectService = (service: CatalogService) => {
    setSelectedServiceId(service.id);
    setServiceForm({
      categoryId: String(service.categoryId),
      name: service.name,
      slug: service.slug,
      description: service.description ?? "",
      minHours: String(service.minHours),
      maxHours: service.maxHours === null ? "" : String(service.maxHours),
      defaultHourlyRate: service.defaultHourlyRate === null ? "" : String(service.defaultHourlyRate),
      useArtistDefaultRate: service.useArtistDefaultRate,
      depositAmount: String(service.depositAmount),
      isActive: service.isActive,
      requiresConsentFormId: service.requiresConsentFormId === null ? "" : String(service.requiresConsentFormId),
    });
    setError(null);
    setSuccess(null);
  };

  const startNewService = () => {
    const defaultCategoryId = categories[0]?.id;
    setSelectedServiceId("new");
    setServiceForm({
      ...EMPTY_SERVICE,
      categoryId: defaultCategoryId ? String(defaultCategoryId) : "",
    });
    setError(null);
    setSuccess(null);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      setError("Category name is required");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      name: categoryForm.name.trim(),
      slug: categoryForm.slug.trim() || undefined,
      description: categoryForm.description.trim() || null,
      sortOrder: Number(categoryForm.sortOrder) || 0,
      isActive: categoryForm.isActive,
    };

    try {
      const res =
        selectedCategoryId === "new"
          ? await fetchWithAuth("/api/catalog/categories", {
              method: "POST",
              body: JSON.stringify(payload),
            })
          : await fetchWithAuth(`/api/catalog/categories/${selectedCategoryId}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save category");
        return;
      }

      const saved = (await res.json()) as CatalogCategory;
      await loadCatalog();
      showSuccess(selectedCategoryId === "new" ? "Category created" : "Category saved");
      setSelectedCategoryId(saved.id);
      selectCategory({ ...saved, services: saved.services ?? [] });
    } catch {
      setError("Could not save category");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (selectedCategoryId === null || selectedCategoryId === "new") return;

    const category = categories.find((item) => item.id === selectedCategoryId);
    const label = category?.name ?? "this category";
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetchWithAuth(`/api/catalog/categories/${selectedCategoryId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not delete category");
        return;
      }

      setSelectedCategoryId(null);
      setCategoryForm(EMPTY_CATEGORY);
      await loadCatalog();
      showSuccess("Category deleted");
    } catch {
      setError("Could not delete category");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveService = async () => {
    if (!serviceForm.name.trim()) {
      setError("Service name is required");
      return;
    }
    if (!serviceForm.categoryId) {
      setError("Choose a category");
      return;
    }
    if (!serviceForm.useArtistDefaultRate && !serviceForm.defaultHourlyRate.trim()) {
      setError("Hourly rate is required, or enable artist default rate");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      categoryId: Number(serviceForm.categoryId),
      name: serviceForm.name.trim(),
      slug: serviceForm.slug.trim() || undefined,
      description: serviceForm.description.trim() || null,
      minHours: Number(serviceForm.minHours) || 1,
      maxHours: serviceForm.maxHours.trim() ? Number(serviceForm.maxHours) : null,
      useArtistDefaultRate: serviceForm.useArtistDefaultRate,
      defaultHourlyRate: serviceForm.useArtistDefaultRate
        ? null
        : Number(serviceForm.defaultHourlyRate),
      depositAmount: Number(serviceForm.depositAmount) || 0,
      isActive: serviceForm.isActive,
      requiresConsentFormId: serviceForm.requiresConsentFormId ? Number(serviceForm.requiresConsentFormId) : null,
    };

    try {
      const res =
        selectedServiceId === "new"
          ? await fetchWithAuth("/api/catalog/services", {
              method: "POST",
              body: JSON.stringify(payload),
            })
          : await fetchWithAuth(`/api/catalog/services/${selectedServiceId}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save service");
        return;
      }

      const saved = (await res.json()) as CatalogService;
      await loadCatalog();
      showSuccess(selectedServiceId === "new" ? "Service created" : "Service saved");
      selectService(saved);
    } catch {
      setError("Could not save service");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteService = async () => {
    if (selectedServiceId === null || selectedServiceId === "new") return;

    const service = allServices.find((item) => item.id === selectedServiceId);
    const label = service?.name ?? "this service";
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetchWithAuth(`/api/catalog/services/${selectedServiceId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not delete service");
        return;
      }

      setSelectedServiceId(null);
      setServiceForm(EMPTY_SERVICE);
      await loadCatalog();
      showSuccess("Service deleted");
    } catch {
      setError("Could not delete service");
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>Access denied</h2>
            <p className="panel__subtitle">Admin access is required to manage services and categories.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel catalog-panel">
      <header className="panel-intro">
        <div className="panel-intro__content">
          <div className="panel-intro__heading">
            <h2>Services &amp; categories</h2>
            <p className="panel__subtitle">Configure what clients can book and how it is priced</p>
          </div>

          <div className="permissions-panel__tabs">
            <button
              className={`permissions-panel__tab${activeTab === "categories" ? " permissions-panel__tab--active" : ""}`}
              onClick={() => {
                setActiveTab("categories");
                setError(null);
                setSuccess(null);
              }}
            >
              Categories
            </button>
            <button
              className={`permissions-panel__tab${activeTab === "services" ? " permissions-panel__tab--active" : ""}`}
              onClick={() => {
                setActiveTab("services");
                setError(null);
                setSuccess(null);
              }}
            >
              Services
            </button>
          </div>
        </div>

        <button className="panel-intro__action permissions-panel__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      {error ? <p className="permissions-panel__error">{error}</p> : null}
      {success ? <p className="settings-panel__success">{success}</p> : null}

      {loading ? (
        <p className="permissions-panel__loading">Loading…</p>
      ) : activeTab === "categories" ? (
        <div className="catalog-layout">
          <div className="catalog-list">
            <div className="catalog-list__header">
              <h3>Categories</h3>
              <button type="button" className="catalog-list__add" onClick={startNewCategory}>
                + Add
              </button>
            </div>
            {categories.length === 0 ? (
              <p className="catalog-list__empty">No categories yet — add your first one.</p>
            ) : (
              <ul>
                {categories.map((category) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      className={`catalog-list__item${
                        selectedCategoryId === category.id ? " catalog-list__item--selected" : ""
                      }`}
                      onClick={() => selectCategory(category)}
                    >
                      <span className="catalog-list__item-name">{category.name}</span>
                      <span className="catalog-list__item-meta">
                        {category.services.length} service{category.services.length === 1 ? "" : "s"}
                        {!category.isActive ? " · Hidden" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="catalog-editor">
            {selectedCategoryId === null ? (
              <p className="catalog-editor__placeholder">Select a category to edit, or add a new one.</p>
            ) : (
              <div className="settings-form">
                <div className="settings-form__section">
                  <h3>{selectedCategoryId === "new" ? "New category" : "Edit category"}</h3>
                  <label className="settings-field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm((c) => ({ ...c, name: e.target.value }))}
                      placeholder="e.g. Tattoo"
                    />
                  </label>
                  <label className="settings-field">
                    <span>Slug</span>
                    <input
                      type="text"
                      value={categoryForm.slug}
                      onChange={(e) => setCategoryForm((c) => ({ ...c, slug: e.target.value }))}
                      placeholder="auto-generated from name if blank"
                    />
                  </label>
                  <label className="settings-field">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={categoryForm.description}
                      onChange={(e) => setCategoryForm((c) => ({ ...c, description: e.target.value }))}
                      placeholder="Optional — shown internally"
                    />
                  </label>
                  <label className="settings-field">
                    <span>Sort order</span>
                    <input
                      type="number"
                      value={categoryForm.sortOrder}
                      onChange={(e) => setCategoryForm((c) => ({ ...c, sortOrder: e.target.value }))}
                    />
                  </label>
                  <label className="catalog-toggle">
                    <input
                      type="checkbox"
                      checked={categoryForm.isActive}
                      onChange={(e) => setCategoryForm((c) => ({ ...c, isActive: e.target.checked }))}
                    />
                    <span>Visible in booking flow</span>
                  </label>
                  <button
                    className="permissions-panel__save"
                    onClick={() => void handleSaveCategory()}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : selectedCategoryId === "new" ? "Create category" : "Save category"}
                  </button>
                  {selectedCategoryId !== "new" && (
                    <div className="settings-form__section settings-form__section--danger">
                      <h3>Delete category</h3>
                      <p className="settings-form__hint">
                        Permanently remove this category. Delete all services in it first.
                      </p>
                      <button
                        type="button"
                        className="settings-panel__logout"
                        onClick={() => void handleDeleteCategory()}
                        disabled={saving}
                      >
                        Delete category
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="catalog-layout">
          <div className="catalog-list">
            <div className="catalog-list__header">
              <h3>Services</h3>
              <button
                type="button"
                className="catalog-list__add"
                onClick={startNewService}
                disabled={categories.length === 0}
              >
                + Add
              </button>
            </div>
            {categories.length === 0 ? (
              <p className="catalog-list__empty">Add a category first, then create services.</p>
            ) : allServices.length === 0 ? (
              <p className="catalog-list__empty">No services yet — add your first one.</p>
            ) : (
              <ul>
                {allServices.map((service) => (
                  <li key={service.id}>
                    <button
                      type="button"
                      className={`catalog-list__item${
                        selectedServiceId === service.id ? " catalog-list__item--selected" : ""
                      }`}
                      onClick={() => selectService(service)}
                    >
                      <span className="catalog-list__item-name">{service.name}</span>
                      <span className="catalog-list__item-meta">
                        {service.categoryName} · {serviceRateLabel(service)}
                        {!service.isActive ? " · Hidden" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="catalog-editor">
            {selectedServiceId === null ? (
              <p className="catalog-editor__placeholder">Select a service to edit, or add a new one.</p>
            ) : (
              <div className="settings-form">
                <div className="settings-form__section">
                  <h3>{selectedServiceId === "new" ? "New service" : "Edit service"}</h3>
                  <label className="settings-field">
                    <span>Category</span>
                    <select
                      value={serviceForm.categoryId}
                      onChange={(e) => setServiceForm((s) => ({ ...s, categoryId: e.target.value }))}
                    >
                      <option value="">Choose…</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={serviceForm.name}
                      onChange={(e) => setServiceForm((s) => ({ ...s, name: e.target.value }))}
                      placeholder="e.g. Half sleeve"
                    />
                  </label>
                  <label className="settings-field">
                    <span>Slug</span>
                    <input
                      type="text"
                      value={serviceForm.slug}
                      onChange={(e) => setServiceForm((s) => ({ ...s, slug: e.target.value }))}
                      placeholder="auto-generated from name if blank"
                    />
                  </label>
                  <label className="settings-field">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={serviceForm.description}
                      onChange={(e) => setServiceForm((s) => ({ ...s, description: e.target.value }))}
                      placeholder="Optional — shown when selecting a service"
                    />
                  </label>
                  <div className="catalog-form__row">
                    <label className="settings-field">
                      <span>Min hours</span>
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={serviceForm.minHours}
                        onChange={(e) => setServiceForm((s) => ({ ...s, minHours: e.target.value }))}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Max hours</span>
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={serviceForm.maxHours}
                        onChange={(e) => setServiceForm((s) => ({ ...s, maxHours: e.target.value }))}
                        placeholder="Optional"
                      />
                    </label>
                  </div>
                  <label className="catalog-toggle">
                    <input
                      type="checkbox"
                      checked={serviceForm.useArtistDefaultRate}
                      onChange={(e) =>
                        setServiceForm((s) => ({ ...s, useArtistDefaultRate: e.target.checked }))
                      }
                    />
                    <span>Use artist default hourly rate</span>
                  </label>
                  <div className="catalog-form__row">
                    <label className="settings-field">
                      <span>Hourly rate (£)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={serviceForm.defaultHourlyRate}
                        disabled={serviceForm.useArtistDefaultRate}
                        onChange={(e) => setServiceForm((s) => ({ ...s, defaultHourlyRate: e.target.value }))}
                        placeholder={serviceForm.useArtistDefaultRate ? "Uses each artist's rate" : undefined}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Deposit (£)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={serviceForm.depositAmount}
                        onChange={(e) => setServiceForm((s) => ({ ...s, depositAmount: e.target.value }))}
                      />
                    </label>
                  </div>
                  {serviceForm.useArtistDefaultRate ? (
                    <p className="settings-form__hint">
                      Use for session work — pricing follows each artist&apos;s profile hourly rate.
                    </p>
                  ) : (
                    <p className="settings-form__hint">
                      Use for fixed studio-wide pricing (e.g. consultations). Set £0/hr and a deposit
                      for deposit-only bookings.
                    </p>
                  )}
                  <label className="catalog-toggle">
                    <input
                      type="checkbox"
                      checked={serviceForm.isActive}
                      onChange={(e) => setServiceForm((s) => ({ ...s, isActive: e.target.checked }))}
                    />
                    <span>Available for booking</span>
                  </label>
                  <label className="settings-field">
                    <span>Requires consent form</span>
                    <select
                      value={serviceForm.requiresConsentFormId}
                      onChange={(e) => setServiceForm((s) => ({ ...s, requiresConsentFormId: e.target.value }))}
                    >
                      <option value="">None</option>
                      {consentTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="permissions-panel__save"
                    onClick={() => void handleSaveService()}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : selectedServiceId === "new" ? "Create service" : "Save service"}
                  </button>
                  {selectedServiceId !== "new" && (
                    <div className="settings-form__section settings-form__section--danger">
                      <h3>Delete service</h3>
                      <p className="settings-form__hint">
                        Permanently remove this service. Services with existing bookings cannot be deleted.
                      </p>
                      <button
                        type="button"
                        className="settings-panel__logout"
                        onClick={() => void handleDeleteService()}
                        disabled={saving}
                      >
                        Delete service
                      </button>
                    </div>
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

export default CatalogPanel;
