import { Router } from "express";
import { pool } from "../db";
import { requireAdmin, requireAuth } from "../auth/middleware";
import { logActivity, diffFields } from "../activity/log";

export const catalogRouter = Router();
catalogRouter.use(requireAuth);

interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

interface ServiceRow {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  description: string | null;
  min_hours: string;
  max_hours: string | null;
  default_hourly_rate: string | null;
  use_artist_default_rate: boolean;
  deposit_amount: string;
  is_active: boolean;
  requires_consent_form_id: number | null;
}

const SERVICE_COLUMNS =
  "id, category_id, name, slug, description, min_hours, max_hours, default_hourly_rate, use_artist_default_rate, deposit_amount, is_active, requires_consent_form_id";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toCategory(category: CategoryRow, services: ServiceRow[]) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    sortOrder: category.sort_order,
    isActive: category.is_active,
    services: services
      .filter((service) => service.category_id === category.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toService),
  };
}

function toService(service: ServiceRow) {
  return {
    id: service.id,
    categoryId: service.category_id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    minHours: Number(service.min_hours),
    maxHours: service.max_hours === null ? null : Number(service.max_hours),
    defaultHourlyRate:
      service.default_hourly_rate === null ? null : Number(service.default_hourly_rate),
    useArtistDefaultRate: service.use_artist_default_rate,
    depositAmount: Number(service.deposit_amount),
    isActive: service.is_active,
    requiresConsentFormId: service.requires_consent_form_id,
  };
}

function toWizardCategory(category: CategoryRow, services: ServiceRow[]) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    services: services
      .filter((service) => service.category_id === category.id)
      .map((service) => ({
        id: service.id,
        name: service.name,
        slug: service.slug,
        description: service.description,
        minHours: Number(service.min_hours),
        maxHours: service.max_hours === null ? null : Number(service.max_hours),
        defaultHourlyRate:
          service.default_hourly_rate === null ? null : Number(service.default_hourly_rate),
        useArtistDefaultRate: service.use_artist_default_rate,
        depositAmount: Number(service.deposit_amount),
        requiresConsentFormId: service.requires_consent_form_id,
      })),
  };
}

async function uniqueSlug(table: "categories" | "services", base: string, excludeId?: number) {
  let slug = base || "item";
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE slug = $1${excludeId ? " AND id != $2" : ""} LIMIT 1`,
      excludeId ? [candidate, excludeId] : [candidate]
    );
    if (rows.length === 0) return candidate;
    suffix += 1;
  }
}

function parseHours(value: unknown, label: string): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "invalid";
  return num;
}

function parseMoney(value: unknown, label: string): number | "invalid" {
  if (value === undefined || value === null) return "invalid";
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return "invalid";
  return num;
}

// Categories with their active services nested underneath — exactly the
// shape the "select a service" step of the booking wizard needs, so the
// frontend doesn't have to stitch two requests together.
catalogRouter.get("/", async (_req, res) => {
  const { rows: categories } = await pool.query<CategoryRow>(
    "SELECT id, name, slug, description, sort_order, is_active FROM categories WHERE is_active = TRUE ORDER BY sort_order, name"
  );
  const { rows: services } = await pool.query<ServiceRow>(
    `SELECT ${SERVICE_COLUMNS}
     FROM services WHERE is_active = TRUE ORDER BY name`
  );

  const result = categories
    .map((category) => toWizardCategory(category, services))
    .filter((category) => category.services.length > 0);

  res.json(result);
});

catalogRouter.get("/manage", requireAdmin, async (_req, res) => {
  const { rows: categories } = await pool.query<CategoryRow>(
    "SELECT id, name, slug, description, sort_order, is_active FROM categories ORDER BY sort_order, name"
  );
  const { rows: services } = await pool.query<ServiceRow>(
    `SELECT ${SERVICE_COLUMNS}
     FROM services ORDER BY name`
  );

  res.json({
    categories: categories.map((category) => toCategory(category, services)),
  });
});

catalogRouter.post("/categories", requireAdmin, async (req, res) => {
  const body = req.body as {
    name?: string;
    slug?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  };

  const name = body.name?.trim();
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const slug = await uniqueSlug("categories", slugify(body.slug?.trim() || name));
  const sortOrder = body.sortOrder ?? 0;
  const isActive = body.isActive ?? true;
  const description = body.description?.trim() || null;

  const { rows } = await pool.query<CategoryRow>(
    `INSERT INTO categories (name, slug, description, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, slug, description, sort_order, is_active`,
    [name, slug, description, sortOrder, isActive]
  );
  await logActivity({
    entityType: "category",
    entityId: rows[0].id,
    eventType: "created",
    actorUserId: req.user!.id,
    description: `Category "${rows[0].name}" created`,
  });

  res.status(201).json(toCategory(rows[0], []));
});

catalogRouter.patch("/categories/:id", requireAdmin, async (req, res) => {
  const categoryId = Number(req.params.id);
  if (!Number.isFinite(categoryId)) {
    res.status(400).json({ error: "Invalid category id" });
    return;
  }

  const body = req.body as {
    name?: string;
    slug?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  };

  const { rows: existingRows } = await pool.query<CategoryRow>(
    "SELECT id, name, slug, description, sort_order, is_active FROM categories WHERE id = $1",
    [categoryId]
  );
  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    updates.push(`name = $${params.length + 1}`);
    params.push(name);
  }

  if (body.slug !== undefined) {
    const slug = await uniqueSlug("categories", slugify(body.slug.trim()), categoryId);
    updates.push(`slug = $${params.length + 1}`);
    params.push(slug);
  }

  if (body.description !== undefined) {
    updates.push(`description = $${params.length + 1}`);
    params.push(body.description?.trim() || null);
  }

  if (body.sortOrder !== undefined) {
    updates.push(`sort_order = $${params.length + 1}`);
    params.push(body.sortOrder);
  }

  if (body.isActive !== undefined) {
    updates.push(`is_active = $${params.length + 1}`);
    params.push(body.isActive);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: "No changes provided" });
    return;
  }

  updates.push("updated_at = now()");
  params.push(categoryId);

  const { rows } = await pool.query<CategoryRow>(
    `UPDATE categories SET ${updates.join(", ")} WHERE id = $${params.length}
     RETURNING id, name, slug, description, sort_order, is_active`,
    params
  );

  const { rows: services } = await pool.query<ServiceRow>(
    `SELECT ${SERVICE_COLUMNS}
     FROM services WHERE category_id = $1 ORDER BY name`,
    [categoryId]
  );

  await logActivity({
    entityType: "category",
    entityId: categoryId,
    eventType: "updated",
    actorUserId: req.user!.id,
    description: `Category "${rows[0].name}" updated`,
    changes: diffFields(
      existing as unknown as Record<string, unknown>,
      rows[0] as unknown as Record<string, unknown>,
      ["name", "slug", "description", "sort_order", "is_active"]
    ),
  });

  res.json(toCategory(rows[0], services));
});

catalogRouter.delete("/categories/:id", requireAdmin, async (req, res) => {
  const categoryId = Number(req.params.id);
  if (!Number.isFinite(categoryId)) {
    res.status(400).json({ error: "Invalid category id" });
    return;
  }

  const { rows: existingRows } = await pool.query<CategoryRow>(
    "SELECT id, name, slug, description, sort_order, is_active FROM categories WHERE id = $1",
    [categoryId]
  );
  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  const { rows: serviceRows } = await pool.query<{ id: number }>(
    "SELECT id FROM services WHERE category_id = $1 LIMIT 1",
    [categoryId]
  );
  if (serviceRows.length > 0) {
    res.status(409).json({ error: "This category still has services — delete them first" });
    return;
  }

  await pool.query("DELETE FROM categories WHERE id = $1", [categoryId]);
  await logActivity({
    entityType: "category",
    entityId: categoryId,
    eventType: "deleted",
    actorUserId: req.user!.id,
    description: `Category "${existing.name}" deleted`,
  });

  res.json({ status: "deleted" });
});

catalogRouter.post("/services", requireAdmin, async (req, res) => {
  const body = req.body as {
    categoryId?: number;
    name?: string;
    slug?: string;
    description?: string | null;
    minHours?: number;
    maxHours?: number | null;
    defaultHourlyRate?: number | null;
    useArtistDefaultRate?: boolean;
    depositAmount?: number;
    isActive?: boolean;
    requiresConsentFormId?: number | null;
  };

  const categoryId = Number(body.categoryId);
  if (!Number.isFinite(categoryId)) {
    res.status(400).json({ error: "categoryId is required" });
    return;
  }

  const { rows: categoryRows } = await pool.query("SELECT id FROM categories WHERE id = $1", [categoryId]);
  if (categoryRows.length === 0) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  const name = body.name?.trim();
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const minHours = parseHours(body.minHours ?? 1, "minHours");
  if (minHours === "invalid") {
    res.status(400).json({ error: "minHours must be greater than 0" });
    return;
  }

  const maxHours = parseHours(body.maxHours, "maxHours");
  if (maxHours === "invalid") {
    res.status(400).json({ error: "maxHours must be greater than 0" });
    return;
  }
  if (maxHours !== null && maxHours < (minHours ?? 1)) {
    res.status(400).json({ error: "maxHours must be at least minHours" });
    return;
  }

  const useArtistDefaultRate = body.useArtistDefaultRate ?? false;

  let defaultHourlyRate: number | null;
  if (useArtistDefaultRate) {
    defaultHourlyRate = null;
  } else {
    const parsed = parseMoney(body.defaultHourlyRate, "defaultHourlyRate");
    if (parsed === "invalid") {
      res.status(400).json({ error: "defaultHourlyRate is required unless using the artist default rate" });
      return;
    }
    defaultHourlyRate = parsed;
  }

  const depositAmount = body.depositAmount === undefined ? 0 : parseMoney(body.depositAmount, "depositAmount");
  if (depositAmount === "invalid") {
    res.status(400).json({ error: "depositAmount must be 0 or greater" });
    return;
  }

  const slug = await uniqueSlug("services", slugify(body.slug?.trim() || name));
  const description = body.description?.trim() || null;
  const isActive = body.isActive ?? true;

  const requiresConsentFormId = body.requiresConsentFormId ?? null;
  if (requiresConsentFormId !== null) {
    const { rows: templateRows } = await pool.query("SELECT id FROM consent_form_templates WHERE id = $1", [
      requiresConsentFormId,
    ]);
    if (templateRows.length === 0) {
      res.status(404).json({ error: "Consent form template not found" });
      return;
    }
  }

  const { rows } = await pool.query<ServiceRow>(
    `INSERT INTO services (category_id, name, slug, description, min_hours, max_hours, default_hourly_rate, use_artist_default_rate, deposit_amount, is_active, requires_consent_form_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${SERVICE_COLUMNS}`,
    [
      categoryId,
      name,
      slug,
      description,
      minHours ?? 1,
      maxHours,
      defaultHourlyRate,
      useArtistDefaultRate,
      depositAmount,
      isActive,
      requiresConsentFormId,
    ]
  );

  await logActivity({
    entityType: "service",
    entityId: rows[0].id,
    eventType: "created",
    actorUserId: req.user!.id,
    description: `Service "${rows[0].name}" created`,
  });

  res.status(201).json(toService(rows[0]));
});

catalogRouter.patch("/services/:id", requireAdmin, async (req, res) => {
  const serviceId = Number(req.params.id);
  if (!Number.isFinite(serviceId)) {
    res.status(400).json({ error: "Invalid service id" });
    return;
  }

  const body = req.body as {
    categoryId?: number;
    name?: string;
    slug?: string;
    description?: string | null;
    minHours?: number;
    maxHours?: number | null;
    defaultHourlyRate?: number | null;
    useArtistDefaultRate?: boolean;
    depositAmount?: number;
    isActive?: boolean;
    requiresConsentFormId?: number | null;
  };

  const { rows: existingRows } = await pool.query<ServiceRow>(
    `SELECT ${SERVICE_COLUMNS}
     FROM services WHERE id = $1`,
    [serviceId]
  );
  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.categoryId !== undefined) {
    const categoryId = Number(body.categoryId);
    if (!Number.isFinite(categoryId)) {
      res.status(400).json({ error: "Invalid categoryId" });
      return;
    }
    const { rows: categoryRows } = await pool.query("SELECT id FROM categories WHERE id = $1", [categoryId]);
    if (categoryRows.length === 0) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    updates.push(`category_id = $${params.length + 1}`);
    params.push(categoryId);
  }

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    updates.push(`name = $${params.length + 1}`);
    params.push(name);
  }

  if (body.slug !== undefined) {
    const slug = await uniqueSlug("services", slugify(body.slug.trim()), serviceId);
    updates.push(`slug = $${params.length + 1}`);
    params.push(slug);
  }

  if (body.description !== undefined) {
    updates.push(`description = $${params.length + 1}`);
    params.push(body.description?.trim() || null);
  }

  const nextMinHours =
    body.minHours !== undefined ? parseHours(body.minHours, "minHours") : Number(existing.min_hours);
  if (nextMinHours === "invalid") {
    res.status(400).json({ error: "minHours must be greater than 0" });
    return;
  }

  const nextMaxHours =
    body.maxHours !== undefined
      ? parseHours(body.maxHours, "maxHours")
      : existing.max_hours === null
        ? null
        : Number(existing.max_hours);
  if (nextMaxHours === "invalid") {
    res.status(400).json({ error: "maxHours must be greater than 0" });
    return;
  }
  if (nextMaxHours !== null && nextMaxHours < (nextMinHours ?? 1)) {
    res.status(400).json({ error: "maxHours must be at least minHours" });
    return;
  }

  if (body.minHours !== undefined) {
    updates.push(`min_hours = $${params.length + 1}`);
    params.push(nextMinHours);
  }

  if (body.maxHours !== undefined) {
    updates.push(`max_hours = $${params.length + 1}`);
    params.push(nextMaxHours);
  }

  if (body.useArtistDefaultRate !== undefined) {
    updates.push(`use_artist_default_rate = $${params.length + 1}`);
    params.push(body.useArtistDefaultRate);
    if (body.useArtistDefaultRate) {
      updates.push(`default_hourly_rate = $${params.length + 1}`);
      params.push(null);
    }
  }

  if (body.defaultHourlyRate !== undefined && body.useArtistDefaultRate !== true) {
    const defaultHourlyRate = parseMoney(body.defaultHourlyRate, "defaultHourlyRate");
    if (defaultHourlyRate === "invalid") {
      res.status(400).json({ error: "defaultHourlyRate must be 0 or greater" });
      return;
    }
    updates.push(`default_hourly_rate = $${params.length + 1}`);
    params.push(defaultHourlyRate);
    if (body.useArtistDefaultRate === false || (body.useArtistDefaultRate === undefined && existing.use_artist_default_rate)) {
      updates.push(`use_artist_default_rate = $${params.length + 1}`);
      params.push(false);
    }
  }

  const willUseArtistDefault =
    body.useArtistDefaultRate !== undefined ? body.useArtistDefaultRate : existing.use_artist_default_rate;
  const willHaveRate =
    body.defaultHourlyRate !== undefined
      ? body.defaultHourlyRate !== null
      : existing.default_hourly_rate !== null;
  if (!willUseArtistDefault && !willHaveRate && body.useArtistDefaultRate === false) {
    res.status(400).json({ error: "defaultHourlyRate is required when not using the artist default rate" });
    return;
  }

  if (body.depositAmount !== undefined) {
    const depositAmount = parseMoney(body.depositAmount, "depositAmount");
    if (depositAmount === "invalid") {
      res.status(400).json({ error: "depositAmount must be 0 or greater" });
      return;
    }
    updates.push(`deposit_amount = $${params.length + 1}`);
    params.push(depositAmount);
  }

  if (body.isActive !== undefined) {
    updates.push(`is_active = $${params.length + 1}`);
    params.push(body.isActive);
  }

  if (body.requiresConsentFormId !== undefined) {
    const requiresConsentFormId = body.requiresConsentFormId;
    if (requiresConsentFormId !== null) {
      const { rows: templateRows } = await pool.query("SELECT id FROM consent_form_templates WHERE id = $1", [
        requiresConsentFormId,
      ]);
      if (templateRows.length === 0) {
        res.status(404).json({ error: "Consent form template not found" });
        return;
      }
    }
    updates.push(`requires_consent_form_id = $${params.length + 1}`);
    params.push(requiresConsentFormId);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: "No changes provided" });
    return;
  }

  updates.push("updated_at = now()");
  params.push(serviceId);

  const { rows } = await pool.query<ServiceRow>(
    `UPDATE services SET ${updates.join(", ")} WHERE id = $${params.length}
     RETURNING ${SERVICE_COLUMNS}`,
    params
  );

  await logActivity({
    entityType: "service",
    entityId: serviceId,
    eventType: "updated",
    actorUserId: req.user!.id,
    description: `Service "${rows[0].name}" updated`,
    changes: diffFields(existing as unknown as Record<string, unknown>, rows[0] as unknown as Record<string, unknown>, [
      "name",
      "slug",
      "category_id",
      "min_hours",
      "max_hours",
      "default_hourly_rate",
      "use_artist_default_rate",
      "deposit_amount",
      "is_active",
      "requires_consent_form_id",
    ]),
  });

  res.json(toService(rows[0]));
});

catalogRouter.delete("/services/:id", requireAdmin, async (req, res) => {
  const serviceId = Number(req.params.id);
  if (!Number.isFinite(serviceId)) {
    res.status(400).json({ error: "Invalid service id" });
    return;
  }

  const { rows: existingRows } = await pool.query<ServiceRow>(
    `SELECT ${SERVICE_COLUMNS}
     FROM services WHERE id = $1`,
    [serviceId]
  );
  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const { rows: bookingRows } = await pool.query<{ id: number }>(
    "SELECT id FROM bookings WHERE service_id = $1 LIMIT 1",
    [serviceId]
  );
  if (bookingRows.length > 0) {
    res.status(409).json({ error: "This service has bookings and cannot be deleted" });
    return;
  }

  await pool.query("DELETE FROM services WHERE id = $1", [serviceId]);
  await logActivity({
    entityType: "service",
    entityId: serviceId,
    eventType: "deleted",
    actorUserId: req.user!.id,
    description: `Service "${existing.name}" deleted`,
  });

  res.json({ status: "deleted" });
});
