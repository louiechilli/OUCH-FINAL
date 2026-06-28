import { pool } from "../db";
import { getSmsProvider } from "./index";
import { getSmsQueue, ensureRedisConnected } from "./queue";

export interface SmsMessageRow {
  id: number;
  client_id: number | null;
  phone_numbers: string[];
  body: string;
  status: "queued" | "sending" | "sent" | "failed";
  provider: string;
  error_message: string | null;
  job_id: string | null;
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toSmsMessage(row: SmsMessageRow & { client_first_name?: string; client_last_name?: string }) {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName:
      row.client_first_name && row.client_last_name
        ? `${row.client_first_name} ${row.client_last_name}`
        : null,
    phoneNumbers: row.phone_numbers,
    body: row.body,
    status: row.status,
    provider: row.provider,
    errorMessage: row.error_message,
    jobId: row.job_id,
    sentAt: row.sent_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function normalizePhoneNumber(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

export async function listRecentSmsMessages(limit = 25) {
  const { rows } = await pool.query<
    SmsMessageRow & { client_first_name: string | null; client_last_name: string | null }
  >(
    `SELECT m.*, c.first_name AS client_first_name, c.last_name AS client_last_name
     FROM sms_messages m
     LEFT JOIN clients c ON c.id = m.client_id
     ORDER BY m.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map(toSmsMessage);
}

export async function enqueueSms(input: {
  phoneNumbers: string[];
  text: string;
  clientId?: number | null;
}) {
  const phones = input.phoneNumbers.map(normalizePhoneNumber).filter(Boolean);
  if (phones.length === 0) {
    throw new Error("At least one phone number is required");
  }
  if (!input.text.trim()) {
    throw new Error("Message text is required");
  }

  const provider = getSmsProvider();
  const config = provider.getConfigStatus();
  if (!config.configured) {
    throw new Error(`SMS is not configured. Missing: ${config.missing.join(", ")}`);
  }

  const { rows } = await pool.query<SmsMessageRow>(
    `INSERT INTO sms_messages (client_id, phone_numbers, body, status, provider)
     VALUES ($1, $2, $3, 'queued', $4)
     RETURNING id, client_id, phone_numbers, body, status, provider, error_message, job_id, sent_at, created_at, updated_at`,
    [input.clientId ?? null, phones, input.text.trim(), config.provider]
  );

  const message = rows[0];
  await ensureRedisConnected();
  const job = await getSmsQueue().add("send", {
    smsMessageId: message.id,
    phoneNumbers: phones,
    text: input.text.trim(),
  });

  await pool.query("UPDATE sms_messages SET job_id = $1, updated_at = now() WHERE id = $2", [
    job.id,
    message.id,
  ]);

  return toSmsMessage({ ...message, job_id: job.id ?? null });
}

export async function enqueueSmsToClient(clientId: number, text: string) {
  const { rows } = await pool.query<{ id: number; phone: string | null }>(
    "SELECT id, phone FROM clients WHERE id = $1",
    [clientId]
  );
  const client = rows[0];
  if (!client) throw new Error("Client not found");
  if (!client.phone?.trim()) {
    throw new Error("Client has no phone number on file");
  }

  return enqueueSms({
    clientId: client.id,
    phoneNumbers: [client.phone],
    text,
  });
}
