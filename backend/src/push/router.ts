import { Router } from "express";
import type webpush from "web-push";
import { requireAuth } from "../auth/middleware";
import { logActivity } from "../activity/log";
import {
  getVapidPublicKey,
  isPushConfigured,
  savePushSubscription,
  sendPushToUser,
} from "./service";

export const pushRouter = Router();

pushRouter.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: getVapidPublicKey(), configured: isPushConfigured() });
});

pushRouter.post("/subscribe", requireAuth, async (req, res) => {
  if (!isPushConfigured()) {
    res.status(503).json({ error: "Push notifications are not configured on this server" });
    return;
  }

  try {
    const subscription = req.body as webpush.PushSubscription;
    await savePushSubscription(req.user!.id, subscription, req.header("user-agent"));
    await logActivity({
      entityType: "push_subscription",
      eventType: "subscribed",
      actorUserId: req.user!.id,
      description: "Device subscribed to push notifications",
      metadata: { endpoint: subscription.endpoint },
    });
    res.status(201).json({ status: "subscribed" });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

pushRouter.post("/test", requireAuth, async (req, res) => {
  if (!isPushConfigured()) {
    res.status(503).json({ error: "Push notifications are not configured on this server" });
    return;
  }

  const sent = await sendPushToUser(req.user!.id, {
    title: "EPOS test notification",
    body: "Push notifications are wired up correctly on this device.",
    link: "/",
  });

  res.json({ sent });
});
