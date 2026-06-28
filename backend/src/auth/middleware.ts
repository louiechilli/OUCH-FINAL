import type { NextFunction, Request, Response } from "express";
import { pool } from "../db";
import { verifyAccessToken } from "./jwt";

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; isAdmin: boolean };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing access token" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, isAdmin: payload.isAdmin };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired access token" });
  }
}

/** Verifies is_admin from the database — do not rely on JWT alone. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    void (async () => {
      try {
        const { rows } = await pool.query<{ is_admin: boolean }>(
          "SELECT is_admin FROM users WHERE id = $1",
          [req.user!.id]
        );
        if (!rows[0]?.is_admin) {
          res.status(403).json({ error: "Admin access required" });
          return;
        }
        req.user!.isAdmin = true;
        next();
      } catch {
        res.status(500).json({ error: "Could not verify admin status" });
      }
    })();
  });
}
