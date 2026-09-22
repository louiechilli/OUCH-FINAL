import express from "express";
import cors from "cors";
import { pool, runMigrations } from "./db";
import { pushRouter } from "./push/router";
import { authRouter } from "./auth/router";
import { calendarRouter } from "./calendar/router";
import { bookingsRouter } from "./bookings/router";
import { blocksRouter } from "./blocks/router";
import { renewExpiringWatches, startWatchesForAllActiveArtists } from "./calendar/watch";
import { adminRouter } from "./admin/router";
import { catalogRouter } from "./catalog/router";
import { artistsRouter } from "./artists/router";
import { clientsRouter } from "./clients/router";
import { availabilityRouter } from "./availability/router";
import { settingsRouter } from "./settings/router";
import { consentRouter } from "./consent/router";
import { activityRouter } from "./activity/router";
import { terminalsRouter } from "./terminals/router";
import { testingRouter } from "./testing/router";
import { startSmsWorker } from "./sms/queue";
import { notificationsRouter } from "./notifications/router";
import { portalRouter } from "./portal/router";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/push", pushRouter);
app.use("/api/auth", authRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/blocks", blocksRouter);
app.use("/api/admin", adminRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/artists", artistsRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/availability", availabilityRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/consent", consentRouter);
app.use("/api/activity", activityRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/portal/:token", portalRouter);
app.use("/api/admin/terminals", terminalsRouter);
app.use("/api/admin/testing", testingRouter);

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const WATCH_RENEWAL_INTERVAL_MS = 60 * 60 * 1000;

runMigrations()
  .then(() => {
    app.listen(port, () => {
      console.log(`EPOS backend listening on port ${port}`);
    });

    // Best-effort — missing GOOGLE_SERVICE_ACCOUNT_KEY or PUBLIC_BASE_URL
    // shouldn't stop the app from booting, just leave calendar sync idle.
    startWatchesForAllActiveArtists().catch((err) =>
      console.error("Failed to start Google Calendar watches on boot", err)
    );
    startSmsWorker().catch((err) =>
      console.error("Failed to start SMS queue worker on boot", err)
    );
    setInterval(() => {
      renewExpiringWatches().catch((err) => console.error("Failed to renew Google Calendar watches", err));
    }, WATCH_RENEWAL_INTERVAL_MS);
  })
  .catch((err) => {
    console.error("Failed to run migrations", err);
    process.exit(1);
  });
