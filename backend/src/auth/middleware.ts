import type { NextFunction, Request, Response } from "express";
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
