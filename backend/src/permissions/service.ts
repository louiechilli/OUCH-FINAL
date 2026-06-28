import { pool } from "../db";

/** Admins bypass granular checks; others need an explicit user_permissions row. */
export async function userHasPermission(userId: number, permissionKey: string): Promise<boolean> {
  const { rows: adminRows } = await pool.query<{ is_admin: boolean }>(
    "SELECT is_admin FROM users WHERE id = $1",
    [userId]
  );
  if (adminRows[0]?.is_admin) return true;

  const { rows } = await pool.query(
    `SELECT 1 FROM user_permissions up
     JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = $1 AND p.key = $2`,
    [userId, permissionKey]
  );
  return rows.length > 0;
}

export async function getUserPermissionKeys(userId: number): Promise<string[]> {
  const { rows: adminRows } = await pool.query<{ is_admin: boolean }>(
    "SELECT is_admin FROM users WHERE id = $1",
    [userId]
  );
  if (adminRows[0]?.is_admin) {
    const { rows } = await pool.query<{ key: string }>("SELECT key FROM permissions ORDER BY key");
    return rows.map((r) => r.key);
  }

  const { rows } = await pool.query<{ key: string }>(
    `SELECT p.key FROM user_permissions up
     JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = $1
     ORDER BY p.key`,
    [userId]
  );
  return rows.map((r) => r.key);
}
