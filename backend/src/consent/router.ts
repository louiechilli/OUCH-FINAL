import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth/middleware";
import { logActivity } from "../activity/log";

export const consentRouter = Router();
consentRouter.use(requireAuth);

interface TemplateRow {
  id: number;
  key: string;
  name: string;
  fields: unknown;
  disclaimer_text: string;
}

function toTemplate(row: TemplateRow) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    fields: row.fields,
    disclaimerText: row.disclaimer_text,
  };
}

// Just id/name — enough for the catalog's "requires consent form" dropdown.
consentRouter.get("/templates", async (_req, res) => {
  const { rows } = await pool.query<TemplateRow>(
    "SELECT id, key, name, fields, disclaimer_text FROM consent_form_templates ORDER BY name"
  );
  res.json(rows.map((row) => ({ id: row.id, key: row.key, name: row.name })));
});

// Full template, including the question list and disclaimer text the
// signing page needs to render.
consentRouter.get("/templates/:id", async (req, res) => {
  const { rows } = await pool.query<TemplateRow>(
    "SELECT id, key, name, fields, disclaimer_text FROM consent_form_templates WHERE id = $1",
    [req.params.id]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Consent form template not found" });
    return;
  }
  res.json(toTemplate(rows[0]));
});

consentRouter.get("/submissions", async (req, res) => {
  const { bookingId } = req.query as Record<string, string | undefined>;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (bookingId) {
    params.push(Number(bookingId));
    conditions.push(`cs.booking_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT cs.id, cs.booking_id, cs.template_id, cs.answers, cs.client_signature, cs.artist_signature,
            cs.signed_at, cs.created_at, t.name AS template_name
     FROM consent_submissions cs
     JOIN consent_form_templates t ON t.id = cs.template_id
     ${where}
     ORDER BY cs.signed_at DESC`,
    params
  );
  res.json(rows);
});

consentRouter.get("/submissions/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cs.*, t.name AS template_name
     FROM consent_submissions cs
     JOIN consent_form_templates t ON t.id = cs.template_id
     WHERE cs.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Consent submission not found" });
    return;
  }
  res.json(rows[0]);
});

consentRouter.post("/submissions", async (req, res) => {
  const { bookingId, templateId, answers, clientSignature, artistSignature } = req.body as {
    bookingId?: number;
    templateId?: number;
    answers?: Record<string, unknown>;
    clientSignature?: string;
    artistSignature?: string | null;
  };

  if (!bookingId || !templateId || !clientSignature) {
    res.status(400).json({ error: "bookingId, templateId and clientSignature are required" });
    return;
  }

  const { rows: bookingRows } = await pool.query("SELECT id FROM bookings WHERE id = $1", [bookingId]);
  if (!bookingRows[0]) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const { rows: templateRows } = await pool.query("SELECT id FROM consent_form_templates WHERE id = $1", [
    templateId,
  ]);
  if (!templateRows[0]) {
    res.status(404).json({ error: "Consent form template not found" });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO consent_submissions (booking_id, template_id, answers, client_signature, artist_signature)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, booking_id, template_id, signed_at`,
    [bookingId, templateId, JSON.stringify(answers ?? {}), clientSignature, artistSignature ?? null]
  );

  await logActivity({
    entityType: "consent_submission",
    entityId: rows[0].id,
    eventType: "signed",
    actorUserId: req.user!.id,
    description: `Consent form signed for booking #${bookingId}`,
    metadata: { bookingId, templateId },
  });

  res.status(201).json(rows[0]);
});

export default consentRouter;
