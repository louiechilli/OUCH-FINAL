import { Router } from "express";
import { pool } from "../db";
import { requireAdmin } from "../auth/middleware";

export const adminRouter = Router();

adminRouter.use(requireAdmin);

interface PermissionGroupRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
}

interface PermissionRow {
  id: number;
  group_id: number;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
}

function toGroup(group: PermissionGroupRow, permissions: PermissionRow[]) {
  return {
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    sortOrder: group.sort_order,
    permissions: permissions
      .filter((p) => p.group_id === group.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description,
        sortOrder: p.sort_order,
      })),
  };
}

/** Full permission schema: groups with nested permissions. */
adminRouter.get("/permissions/schema", async (_req, res) => {
  const [groupResult, permResult] = await Promise.all([
    pool.query<PermissionGroupRow>(
      "SELECT id, name, slug, description, sort_order FROM permission_groups ORDER BY sort_order, name"
    ),
    pool.query<PermissionRow>(
      "SELECT id, group_id, key, name, description, sort_order FROM permissions ORDER BY sort_order, name"
    ),
  ]);

  res.json({
    groups: groupResult.rows.map((g) => toGroup(g, permResult.rows)),
  });
});

/** All users with their assigned permission IDs. */
adminRouter.get("/permissions/users", async (_req, res) => {
  const [usersResult, assignmentsResult] = await Promise.all([
    pool.query<UserRow>(
      "SELECT id, email, name, is_admin FROM users ORDER BY name, email"
    ),
    pool.query<{ user_id: number; permission_id: number }>(
      "SELECT user_id, permission_id FROM user_permissions"
    ),
  ]);

  const permissionsByUser = new Map<number, number[]>();
  for (const row of assignmentsResult.rows) {
    const list = permissionsByUser.get(row.user_id) ?? [];
    list.push(row.permission_id);
    permissionsByUser.set(row.user_id, list);
  }

  res.json({
    users: usersResult.rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isAdmin: u.is_admin,
      permissionIds: permissionsByUser.get(u.id) ?? [],
    })),
  });
});

/** Replace a user's granular permissions (admins keep full access regardless). */
adminRouter.put("/permissions/users/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const { permissionIds } = req.body as { permissionIds?: unknown };
  if (!Array.isArray(permissionIds) || !permissionIds.every((id) => Number.isInteger(id))) {
    res.status(400).json({ error: "permissionIds must be an array of integers" });
    return;
  }

  const { rows: userRows } = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
  if (!userRows[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const uniqueIds = [...new Set(permissionIds as number[])];
  if (uniqueIds.length > 0) {
    const { rows: validRows } = await pool.query<{ id: number }>(
      "SELECT id FROM permissions WHERE id = ANY($1::int[])",
      [uniqueIds]
    );
    if (validRows.length !== uniqueIds.length) {
      res.status(400).json({ error: "One or more permission ids are invalid" });
      return;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM user_permissions WHERE user_id = $1", [userId]);
    for (const permissionId of uniqueIds) {
      await client.query(
        "INSERT INTO user_permissions (user_id, permission_id, granted_by) VALUES ($1, $2, $3)",
        [userId, permissionId, req.user!.id]
      );
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Could not update permissions" });
    return;
  } finally {
    client.release();
  }

  res.json({ status: "ok", permissionIds: uniqueIds });
});

/** Create a permission group. */
adminRouter.post("/permissions/groups", async (req, res) => {
  const { name, slug, description, sortOrder } = req.body as {
    name?: string;
    slug?: string;
    description?: string;
    sortOrder?: number;
  };

  if (!name?.trim() || !slug?.trim()) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }

  const normalizedSlug = slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
    res.status(400).json({ error: "slug must contain only lowercase letters, numbers, and hyphens" });
    return;
  }

  try {
    const { rows } = await pool.query<PermissionGroupRow>(
      `INSERT INTO permission_groups (name, slug, description, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, description, sort_order`,
      [name.trim(), normalizedSlug, description?.trim() || null, sortOrder ?? 0]
    );
    res.status(201).json(toGroup(rows[0], []));
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      res.status(409).json({ error: "A group with this slug already exists" });
      return;
    }
    res.status(500).json({ error: "Could not create permission group" });
  }
});

/** Create a permission within a group. */
adminRouter.post("/permissions", async (req, res) => {
  const { groupId, key, name, description, sortOrder } = req.body as {
    groupId?: number;
    key?: string;
    name?: string;
    description?: string;
    sortOrder?: number;
  };

  if (!groupId || !key?.trim() || !name?.trim()) {
    res.status(400).json({ error: "groupId, key, and name are required" });
    return;
  }

  const normalizedKey = key.trim().toLowerCase();
  if (!/^[a-z0-9.]+$/.test(normalizedKey)) {
    res.status(400).json({ error: "key must contain only lowercase letters, numbers, and dots" });
    return;
  }

  const { rows: groupRows } = await pool.query("SELECT id FROM permission_groups WHERE id = $1", [
    groupId,
  ]);
  if (!groupRows[0]) {
    res.status(404).json({ error: "Permission group not found" });
    return;
  }

  try {
    const { rows } = await pool.query<PermissionRow>(
      `INSERT INTO permissions (group_id, key, name, description, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, group_id, key, name, description, sort_order`,
      [groupId, normalizedKey, name.trim(), description?.trim() || null, sortOrder ?? 0]
    );
    const p = rows[0];
    res.status(201).json({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      sortOrder: p.sort_order,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      res.status(409).json({ error: "A permission with this key already exists" });
      return;
    }
    res.status(500).json({ error: "Could not create permission" });
  }
});
