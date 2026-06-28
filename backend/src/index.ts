import express from "express";
import cors from "cors";
import { pool, runMigrations } from "./db";
import { pushRouter } from "./push";
import { authRouter } from "./auth/router";
import { calendarRouter } from "./calendar/router";
import { bookingsRouter } from "./bookings/router";
import { blocksRouter } from "./blocks/router";
import { renewExpiringWatches, startWatchesForAllActiveArtists } from "./calendar/watch";
import { adminRouter } from "./admin/router";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/push", pushRouter);
app.use("/api/auth", authRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/blocks", blocksRouter);
app.use("/api/admin", adminRouter);

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
    setInterval(() => {
      renewExpiringWatches().catch((err) => console.error("Failed to renew Google Calendar watches", err));
    }, WATCH_RENEWAL_INTERVAL_MS);
  })
  .catch((err) => {
    console.error("Failed to run migrations", err);
    process.exit(1);
  });
