import { Pool } from "pg";
import bcrypt from "bcryptjs";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const SEED_ADMIN_EMAIL = "admin@ouchtattoostudio.com";
const SEED_ADMIN_PASSWORD = "changeme123";

const DEFAULT_CATEGORIES: Array<{ name: string; slug: string; sortOrder: number }> = [
  { name: "Tattoo", slug: "tattoo", sortOrder: 0 },
  { name: "Piercing", slug: "piercing", sortOrder: 1 },
  { name: "Consultation", slug: "consultation", sortOrder: 2 },
  { name: "Touch-up", slug: "touch-up", sortOrder: 3 },
  { name: "Removal", slug: "removal", sortOrder: 4 },
];

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      pin_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    -- Every login account is an artist account, so artists extends users
    -- via user_id rather than duplicating email/phone/name and risking the
    -- two records drifting apart. Business-only fields (bio, calendar id,
    -- default rate) live here.
    CREATE TABLE IF NOT EXISTS artists (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      bio TEXT,
      profile_image_url TEXT,
      google_calendar_id TEXT,
      default_hourly_rate NUMERIC(10, 2),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      min_hours NUMERIC(4, 2) NOT NULL DEFAULT 1,
      max_hours NUMERIC(4, 2),
      default_hourly_rate NUMERIC(10, 2),
      use_artist_default_rate BOOLEAN NOT NULL DEFAULT FALSE,
      deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Lets each artist charge a different hourly rate (and optionally
    -- different min/max hours or deposit) for the same service. Falls back
    -- to services.default_hourly_rate when no row exists for an artist.
    CREATE TABLE IF NOT EXISTS artist_service_rates (
      id SERIAL PRIMARY KEY,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      hourly_rate NUMERIC(10, 2) NOT NULL,
      min_hours_override NUMERIC(4, 2),
      max_hours_override NUMERIC(4, 2),
      deposit_amount_override NUMERIC(10, 2),
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (artist_id, service_id)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      date_of_birth DATE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- hourly_rate_snapshot / min_hours_snapshot / amounts are copied in at
    -- booking time and never recalculated from the live artist/service rate
    -- — a rate change next month must not alter the price of old bookings.
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE RESTRICT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'booked'
        CHECK (status IN ('booked', 'done', 'cancelled')),
      source TEXT NOT NULL DEFAULT 'admin'
        CHECK (source IN ('admin', 'website', 'phone', 'instagram', 'walk_in', 'google_calendar')),
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      duration_minutes INTEGER NOT NULL,
      duration_hours NUMERIC(5, 2) NOT NULL,
      hourly_rate_snapshot NUMERIC(10, 2) NOT NULL,
      min_hours_snapshot NUMERIC(4, 2),
      subtotal_amount NUMERIC(10, 2) NOT NULL,
      deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(10, 2) NOT NULL,
      amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0,
      balance_due NUMERIC(10, 2) NOT NULL,
      client_notes TEXT,
      internal_notes TEXT,
      google_calendar_event_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      cancelled_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_artist_starts_at ON bookings (artist_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_bookings_client_id ON bookings (client_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      amount NUMERIC(10, 2) NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'stripe', 'sumup')),
      payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit', 'balance', 'full_payment', 'refund')),
      status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
      transaction_reference TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id);

    CREATE TABLE IF NOT EXISTS booking_events (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL
        CHECK (event_type IN ('created', 'confirmed', 'rescheduled', 'cancelled', 'payment_added', 'calendar_synced', 'note_added')),
      old_value TEXT,
      new_value TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id ON booking_events (booking_id);

    -- Google Calendar is the source of truth. Any event on an artist's
    -- calendar that we didn't create ourselves (no matching booking) is
    -- treated as a block-out — time the artist is unavailable for EPOS
    -- bookings, managed directly in their calendar (holiday, personal
    -- appointment, etc.) rather than through this app.
    CREATE TABLE IF NOT EXISTS calendar_blocks (
      id SERIAL PRIMARY KEY,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      reason TEXT,
      source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'google_calendar')),
      google_calendar_event_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_blocks_artist_starts_at ON calendar_blocks (artist_id, starts_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_blocks_event_id ON calendar_blocks (google_calendar_event_id)
      WHERE google_calendar_event_id IS NOT NULL;

    -- One push-notification "watch" channel per artist calendar, plus the
    -- incremental sync token Google issues so we only ever pull what
    -- changed since last time instead of re-listing the whole calendar.
    CREATE TABLE IF NOT EXISTS calendar_watch_channels (
      id SERIAL PRIMARY KEY,
      artist_id INTEGER UNIQUE NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      channel_id TEXT UNIQUE NOT NULL,
      resource_id TEXT,
      channel_token TEXT NOT NULL,
      sync_token TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS permission_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_permissions_group_id ON permissions (group_id);

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY (user_id, permission_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions (user_id);

    ALTER TABLE artists ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}';

    -- A consent form is a reusable questionnaire (medical history, disclaimer
    -- text, signature) that a service can require before the appointment is
    -- valid. "fields" is an ordered JSON array of { key, label, type,
    -- required } so new templates don't need a schema change to add.
    CREATE TABLE IF NOT EXISTS consent_form_templates (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      fields JSONB NOT NULL DEFAULT '[]',
      disclaimer_text TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_consent_form_id INTEGER
      REFERENCES consent_form_templates(id) ON DELETE SET NULL;

    -- One signed submission per booking/template. Client and artist
    -- signatures are captured as PNG data URLs straight off a touch canvas
    -- — same "store the string, no separate file storage" approach already
    -- used for artists.profile_image_url.
    CREATE TABLE IF NOT EXISTS consent_submissions (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES consent_form_templates(id) ON DELETE RESTRICT,
      answers JSONB NOT NULL DEFAULT '{}',
      client_signature TEXT NOT NULL,
      artist_signature TEXT,
      signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_consent_submissions_booking_id ON consent_submissions (booking_id);

    -- Per-booking message thread. "sender_role" is forward-looking: today
    -- every account is staff/artist, but a future client-facing channel can
    -- post as 'client' into the same thread without a schema change.
    -- media_url is a data URL, same storage approach as signatures above.
    CREATE TABLE IF NOT EXISTS booking_messages (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sender_role TEXT NOT NULL DEFAULT 'artist' CHECK (sender_role IN ('artist', 'client')),
      body TEXT,
      media_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (body IS NOT NULL OR media_url IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_booking_messages_booking_id ON booking_messages (booking_id);

    -- Universal audit trail. entity_type/event_type are free text, not enums
    -- — the whole point is to log anything against any model without a
    -- migration every time a new event shows up (a new notification
    -- channel, a new admin action, etc). Query by entity (everything that
    -- happened to booking #42), by actor (everything Sarah did), or by
    -- event_type (every cancellation ever) — idx covers all three.
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      event_type TEXT NOT NULL,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_label TEXT,
      description TEXT NOT NULL,
      changes JSONB,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log (entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_event_type ON activity_log (event_type);
    CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log (actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);

    CREATE TABLE IF NOT EXISTS payment_terminals (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'sumup',
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      device_model TEXT,
      device_identifier TEXT,
      is_default BOOLEAN NOT NULL DEFAULT false,
      paired_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (provider, external_id)
    );

    CREATE TABLE IF NOT EXISTS sms_messages (
      id SERIAL PRIMARY KEY,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      phone_numbers TEXT[] NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
      provider TEXT NOT NULL DEFAULT 'smsgate',
      error_message TEXT,
      job_id TEXT,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages (status);
    CREATE INDEX IF NOT EXISTS idx_sms_messages_created_at ON sms_messages (created_at DESC);

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT,
      metadata JSONB,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id)
      WHERE read_at IS NULL;

    CREATE TABLE IF NOT EXISTS booking_portal_tokens (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_accessed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_booking_portal_tokens_hash ON booking_portal_tokens (token_hash);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

    ALTER TABLE services ADD COLUMN IF NOT EXISTS use_artist_default_rate BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE services ALTER COLUMN default_hourly_rate DROP NOT NULL;
  `);

  await migrateBookingStatuses();

  await seedAdminUser();
  await backfillArtistsForUsers();
  await seedCategories();
  await seedPermissionSchema();
  await seedConsentTemplates();
  await repairDepositOnlyBookings();
}

/** Bookings created with a zero hourly rate left total/balance at 0 while deposit > 0. */
async function migrateBookingStatuses() {
  await pool.query(`
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
  `);

  await pool.query(`
    UPDATE bookings SET status = 'booked'
    WHERE status IN ('pending', 'confirmed', 'rescheduled');

    UPDATE bookings SET status = 'done'
    WHERE status IN ('completed', 'no_show');

    ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'booked';
  `);

  await pool.query(`
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('booked', 'done', 'cancelled'));
  `);
}

async function repairDepositOnlyBookings() {
  const { rowCount } = await pool.query(`
    UPDATE bookings
    SET
      total_amount = deposit_amount,
      subtotal_amount = deposit_amount,
      balance_due = deposit_amount - amount_paid
    WHERE deposit_amount > 0
      AND total_amount = 0
      AND amount_paid = 0
  `);
  if (rowCount && rowCount > 0) {
    console.log(`Repaired ${rowCount} booking(s) with zero total but a deposit due.`);
  }
}

async function seedAdminUser() {
  const { rows } = await pool.query("SELECT COUNT(*) FROM users");
  if (Number(rows[0].count) > 0) return;

  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
  await pool.query(
    "INSERT INTO users (email, password_hash, name, is_admin) VALUES ($1, $2, $3, $4)",
    [SEED_ADMIN_EMAIL, passwordHash, "Georgia", true]
  );
  console.log("---");
  console.log("No users found — seeded a default admin artist account:");
  console.log(`  email:    ${SEED_ADMIN_EMAIL}`);
  console.log(`  password: ${SEED_ADMIN_PASSWORD}`);
  console.log("Change this once real accounts are created.");
  console.log("---");
}

// Every user is an artist account — ensure a matching artists row exists for
// any user that doesn't have one yet (covers the seed admin today, and any
// future user-creation path that forgets to do this itself).
async function backfillArtistsForUsers() {
  await pool.query(`
    INSERT INTO artists (user_id, display_name)
    SELECT u.id, u.name
    FROM users u
    LEFT JOIN artists a ON a.user_id = u.id
    WHERE a.id IS NULL
  `);
}

async function seedCategories() {
  const { rows } = await pool.query("SELECT COUNT(*) FROM categories");
  if (Number(rows[0].count) > 0) return;

  for (const category of DEFAULT_CATEGORIES) {
    await pool.query(
      "INSERT INTO categories (name, slug, sort_order) VALUES ($1, $2, $3)",
      [category.name, category.slug, category.sortOrder]
    );
  }
  console.log(`Seeded ${DEFAULT_CATEGORIES.length} default categories.`);
}

const DEFAULT_PERMISSION_GROUPS: Array<{
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  permissions: Array<{ key: string; name: string; description: string; sortOrder: number }>;
}> = [
  {
    name: "Sales",
    slug: "sales",
    description: "Point-of-sale and checkout",
    sortOrder: 0,
    permissions: [
      { key: "sales.view", name: "View sales", description: "View sales history and open tickets", sortOrder: 0 },
      { key: "sales.create", name: "Create sale", description: "Start new sales and add items", sortOrder: 1 },
      { key: "sales.refund", name: "Process refunds", description: "Issue refunds on completed sales", sortOrder: 2 },
    ],
  },
  {
    name: "Bookings",
    slug: "bookings",
    description: "Appointments and scheduling",
    sortOrder: 1,
    permissions: [
      { key: "bookings.view", name: "View bookings", description: "View the schedule and booking details", sortOrder: 0 },
      { key: "bookings.create", name: "Create bookings", description: "Add new appointments", sortOrder: 1 },
      { key: "bookings.edit", name: "Edit bookings", description: "Reschedule or update booking details", sortOrder: 2 },
      { key: "bookings.cancel", name: "Cancel bookings", description: "Cancel or mark no-shows", sortOrder: 3 },
    ],
  },
  {
    name: "Clients",
    slug: "clients",
    description: "Customer records",
    sortOrder: 2,
    permissions: [
      { key: "clients.view", name: "View clients", description: "Browse client profiles", sortOrder: 0 },
      { key: "clients.create", name: "Create clients", description: "Add new client records", sortOrder: 1 },
      { key: "clients.edit", name: "Edit clients", description: "Update client details and notes", sortOrder: 2 },
    ],
  },
  {
    name: "Stock",
    slug: "stock",
    description: "Inventory management",
    sortOrder: 3,
    permissions: [
      { key: "stock.view", name: "View stock", description: "View inventory levels", sortOrder: 0 },
      { key: "stock.edit", name: "Manage stock", description: "Adjust stock counts and reorder", sortOrder: 1 },
    ],
  },
  {
    name: "Reports",
    slug: "reports",
    description: "Analytics and exports",
    sortOrder: 4,
    permissions: [
      { key: "reports.view", name: "View reports", description: "Access dashboards and summaries", sortOrder: 0 },
      { key: "reports.export", name: "Export reports", description: "Download CSV or PDF exports", sortOrder: 1 },
    ],
  },
  {
    name: "Settings",
    slug: "settings",
    description: "Studio configuration",
    sortOrder: 5,
    permissions: [
      { key: "settings.view", name: "View settings", description: "View studio settings", sortOrder: 0 },
      { key: "settings.edit", name: "Edit settings", description: "Change studio configuration", sortOrder: 1 },
    ],
  },
];

interface ConsentFieldDef {
  key: string;
  label: string;
  type: "yesno" | "textarea";
  required?: boolean;
}

const TATTOO_SESSION_CONSENT_FIELDS: ConsentFieldDef[] = [
  { key: "skinDisorders", label: "Skin disorders such as – Psoriasis, Eczema and Impetigo", type: "yesno" },
  { key: "epilepsy", label: "Epilepsy", type: "yesno" },
  { key: "diabetes", label: "Diabetes", type: "yesno" },
  { key: "bloodBorneVirus", label: "HIV, Hepatitis B or C", type: "yesno" },
  { key: "latexAllergy", label: "Allergies to Latex — If “Yes” please let your Artist know", type: "yesno" },
  {
    key: "medication",
    label:
      "Are you taking any medication such as, please list: Anti-depressants, Anti-histamines, Warfarin, Aspirin, Paracetamol",
    type: "yesno",
  },
  { key: "medicationDetails", label: "If yes, please list your medication", type: "textarea", required: false },
  { key: "herbalMedicine", label: "Have you taken any Herbal medicine in the last 24 hours?", type: "yesno" },
  { key: "herbalMedicineDetails", label: "If yes, please give details", type: "textarea", required: false },
  { key: "sleptWell", label: "Have you slept well?", type: "yesno" },
  { key: "alcoholOrDrugs", label: "Have you consumed any Alcohol or drugs in the last 24 hours?", type: "yesno" },
  { key: "pregnantOrBreastfeeding", label: "Are you pregnant or breastfeeding?", type: "yesno" },
];

const TATTOO_SESSION_DISCLAIMER = [
  "I AM 18 YEARS OR OVER AND GIVE PERMISSION FOR OUCH! TATTOO STUDIO TO SCAN MY ID, IF APPLICABLE, AND KEEP ON FILE. I HAVE FILLED OUT THIS CONSENT FORM TO THE BEST OF MY KNOWLEDGE AND UNDERSTAND THIS IS A LEGAL DOCUMENT. NO PERSONAL INFORMATION GIVEN WILL BE PASSED ON TO ANY THIRD PARTIES. ANY FALSE INFORMATION I HAVE GIVEN IS SOLELY MY RESPONSIBILITY.",
  "I WILL NOT HOLD OUCH! TATTOO STUDIO RESPONSIBLE FOR ANY MISSPELLING, INCORRECT TIME OR DATE, OR LOSS OF EMPLOYMENT. THE AFTERCARE HAS BEEN EXPLAINED TO ME AND IT IS SOLELY MY RESPONSIBILITY TO LOOK AFTER MY TATTOO.",
].join("\n\n");

async function seedConsentTemplates() {
  const { rows } = await pool.query("SELECT id FROM consent_form_templates WHERE key = $1", ["tattoo_session"]);
  if (rows.length > 0) return;

  await pool.query(
    `INSERT INTO consent_form_templates (key, name, fields, disclaimer_text)
     VALUES ($1, $2, $3, $4)`,
    ["tattoo_session", "Tattoo Session Consent", JSON.stringify(TATTOO_SESSION_CONSENT_FIELDS), TATTOO_SESSION_DISCLAIMER]
  );
  console.log("Seeded the Tattoo Session consent form template.");
}

async function seedPermissionSchema() {
  const { rows } = await pool.query("SELECT COUNT(*) FROM permission_groups");
  if (Number(rows[0].count) > 0) return;

  for (const group of DEFAULT_PERMISSION_GROUPS) {
    const { rows: groupRows } = await pool.query<{ id: number }>(
      "INSERT INTO permission_groups (name, slug, description, sort_order) VALUES ($1, $2, $3, $4) RETURNING id",
      [group.name, group.slug, group.description, group.sortOrder]
    );
    const groupId = groupRows[0].id;

    for (const perm of group.permissions) {
      await pool.query(
        "INSERT INTO permissions (group_id, key, name, description, sort_order) VALUES ($1, $2, $3, $4, $5)",
        [groupId, perm.key, perm.name, perm.description, perm.sortOrder]
      );
    }
  }

  console.log(`Seeded ${DEFAULT_PERMISSION_GROUPS.length} permission groups.`);
}
