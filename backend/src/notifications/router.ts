import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./service";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const unreadOnly = req.query.unreadOnly === "true";
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const notifications = await listNotifications(req.user!.id, { limit, offset, unreadOnly });
  res.json(notifications);
});

notificationsRouter.get("/unread-count", async (req, res) => {
  const count = await getUnreadCount(req.user!.id);
  res.json({ count });
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  const notificationId = Number(req.params.id);
  if (!Number.isFinite(notificationId)) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }

  const notification = await markNotificationRead(notificationId, req.user!.id);
  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json(notification);
});

notificationsRouter.post("/read-all", async (req, res) => {
  await markAllNotificationsRead(req.user!.id);
  res.json({ ok: true });
});
