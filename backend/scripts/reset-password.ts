import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

function usage() {
  console.log(`Reset a user password (admin recovery).

Usage:
  npm run reset-password -- --list
  npm run reset-password -- --id <userId> [--password <newPassword>]
  npm run reset-password -- --email <email> [--password <newPassword>]

If --password is omitted, a random temporary password is generated.

Examples:
  npm run reset-password -- --list
  npm run reset-password -- --email admin@ouchtattoostudio.com
  npm run reset-password -- --id 1 --password changeme123

Docker:
  docker compose exec backend npm run reset-password -- --email admin@ouchtattoostudio.com
`);
}

function parseArgs(argv: string[]) {
  let id: number | null = null;
  let email: string | null = null;
  let password: string | null = null;
  let list = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--list") {
      list = true;
    } else if (arg === "--id") {
      id = Number(argv[++i]);
    } else if (arg === "--email") {
      email = argv[++i]?.toLowerCase().trim() ?? null;
    } else if (arg === "--password") {
      password = argv[++i] ?? null;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
      process.exit(1);
    }
  }

  return { id, email, password, list };
}

function generatePassword() {
  return randomBytes(9).toString("base64url");
}

async function listUsers() {
  const { rows } = await pool.query<{ id: number; email: string; name: string; is_admin: boolean }>(
    "SELECT id, email, name, is_admin FROM users ORDER BY id"
  );

  if (rows.length === 0) {
    console.log("No users found.");
    return;
  }

  console.log("ID  Email                              Name                 Admin");
  for (const user of rows) {
    console.log(
      `${String(user.id).padEnd(3)} ${user.email.padEnd(34)} ${user.name.padEnd(20)} ${user.is_admin ? "yes" : "no"}`
    );
  }
}

async function resetPassword(opts: {
  id: number | null;
  email: string | null;
  password: string | null;
}) {
  if ((opts.id === null) === (opts.email === null)) {
    console.error("Provide exactly one of --id or --email.");
    usage();
    process.exit(1);
  }

  if (opts.id !== null && (!Number.isInteger(opts.id) || opts.id <= 0)) {
    console.error("Invalid --id");
    process.exit(1);
  }

  const { rows } = await pool.query<{ id: number; email: string; name: string }>(
    opts.id !== null ? "SELECT id, email, name FROM users WHERE id = $1" : "SELECT id, email, name FROM users WHERE email = $1",
    [opts.id ?? opts.email]
  );

  const user = rows[0];
  if (!user) {
    console.error("User not found.");
    process.exit(1);
  }

  const newPassword = opts.password?.trim() || generatePassword();
  if (newPassword.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, user.id]);
  await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [user.id]);

  console.log(`Password reset for user #${user.id} (${user.email}, ${user.name})`);
  console.log(`New password: ${newPassword}`);
  console.log("Existing sessions have been signed out.");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    await listUsers();
    return;
  }

  if (args.id === null && args.email === null) {
    usage();
    process.exit(1);
  }

  await resetPassword(args);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
