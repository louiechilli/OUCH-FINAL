import express from "express";
import cors from "cors";
import { pool, runMigrations } from "./db";
import { pushRouter } from "./push";
import { authRouter } from "./auth/router";
import { adminRouter } from "./admin/router";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/push", pushRouter);
app.use("/api/auth", authRouter);
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

runMigrations()
  .then(() => {
    app.listen(port, () => {
      console.log(`EPOS backend listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to run migrations", err);
    process.exit(1);
  });
