import type { NextFunction, Request, Response } from "express";
import { validatePortalToken } from "./tokens";

declare global {
  namespace Express {
    interface Request {
      portal?: {
        tokenId: number;
        bookingId: number;
        clientId: number;
      };
    }
  }
}

export async function requirePortalToken(req: Request, res: Response, next: NextFunction) {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  const session = await validatePortalToken(token);
  if (!session) {
    res.status(401).json({ error: "This portal link is invalid or has expired" });
    return;
  }
  req.portal = session;
  next();
}
