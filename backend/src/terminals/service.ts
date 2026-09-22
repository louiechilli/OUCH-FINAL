import { pool } from "../db";

export interface StoredTerminalRow {
  id: number;
  provider: string;
  external_id: string;
  name: string;
  device_model: string | null;
  device_identifier: string | null;
  is_default: boolean;
  paired_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface StoredTerminal {
  id: number;
  provider: string;
  externalId: string;
  name: string;
  deviceModel: string | null;
  deviceIdentifier: string | null;
  isDefault: boolean;
  pairedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toStoredTerminal(row: StoredTerminalRow): StoredTerminal {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    name: row.name,
    deviceModel: row.device_model,
    deviceIdentifier: row.device_identifier,
    isDefault: row.is_default,
    pairedAt: row.paired_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listStoredTerminals(): Promise<StoredTerminal[]> {
  const { rows } = await pool.query<StoredTerminalRow>(
    `SELECT id, provider, external_id, name, device_model, device_identifier,
            is_default, paired_at, created_at, updated_at
     FROM payment_terminals
     ORDER BY is_default DESC, name ASC`
  );
  return rows.map(toStoredTerminal);
}

export async function upsertStoredTerminal(input: {
  provider: string;
  externalId: string;
  name: string;
  deviceModel?: string;
  deviceIdentifier?: string;
  isDefault?: boolean;
}): Promise<StoredTerminal> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (input.isDefault) {
      await client.query(
        "UPDATE payment_terminals SET is_default = false WHERE provider = $1",
        [input.provider]
      );
    }

    const { rows } = await client.query<StoredTerminalRow>(
      `INSERT INTO payment_terminals
         (provider, external_id, name, device_model, device_identifier, is_default, paired_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (provider, external_id) DO UPDATE SET
         name = EXCLUDED.name,
         device_model = EXCLUDED.device_model,
         device_identifier = EXCLUDED.device_identifier,
         is_default = EXCLUDED.is_default,
         updated_at = now()
       RETURNING id, provider, external_id, name, device_model, device_identifier,
                 is_default, paired_at, created_at, updated_at`,
      [
        input.provider,
        input.externalId,
        input.name,
        input.deviceModel ?? null,
        input.deviceIdentifier ?? null,
        input.isDefault ?? false,
      ]
    );

    await client.query("COMMIT");
    return toStoredTerminal(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteStoredTerminal(provider: string, externalId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM payment_terminals WHERE provider = $1 AND external_id = $2",
    [provider, externalId]
  );
  return (rowCount ?? 0) > 0;
}

export async function getDefaultStoredTerminal(): Promise<StoredTerminal | null> {
  const { rows } = await pool.query<StoredTerminalRow>(
    `SELECT id, provider, external_id, name, device_model, device_identifier,
            is_default, paired_at, created_at, updated_at
     FROM payment_terminals
     WHERE is_default = true
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  if (rows[0]) return toStoredTerminal(rows[0]);

  const { rows: fallback } = await pool.query<StoredTerminalRow>(
    `SELECT id, provider, external_id, name, device_model, device_identifier,
            is_default, paired_at, created_at, updated_at
     FROM payment_terminals
     ORDER BY created_at ASC
     LIMIT 1`
  );
  return fallback[0] ? toStoredTerminal(fallback[0]) : null;
}

export async function setDefaultTerminal(id: number): Promise<StoredTerminal | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: targetRows } = await client.query<{ provider: string }>(
      "SELECT provider FROM payment_terminals WHERE id = $1",
      [id]
    );
    if (!targetRows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      "UPDATE payment_terminals SET is_default = false WHERE provider = $1",
      [targetRows[0].provider]
    );
    const { rows } = await client.query<StoredTerminalRow>(
      `UPDATE payment_terminals SET is_default = true, updated_at = now()
       WHERE id = $1
       RETURNING id, provider, external_id, name, device_model, device_identifier,
                 is_default, paired_at, created_at, updated_at`,
      [id]
    );
    await client.query("COMMIT");
    return rows[0] ? toStoredTerminal(rows[0]) : null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
