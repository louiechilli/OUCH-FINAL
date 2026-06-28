import { pool } from "../db";

const ENVELOPE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export async function generateEnvelopeCode(bookingId: number): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = "";
    for (let i = 0; i < 4; i++) {
      suffix += ENVELOPE_CHARS[Math.floor(Math.random() * ENVELOPE_CHARS.length)];
    }
    const code = `BK${bookingId}-${suffix}`;
    const { rows } = await pool.query("SELECT id FROM payments WHERE transaction_reference = $1", [code]);
    if (!rows[0]) return code;
  }
  throw new Error("Could not generate unique envelope code");
}
