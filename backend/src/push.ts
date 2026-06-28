import { Router } from "express";
import webpush from "web-push";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails("mailto:admin@ouchtattoostudio.com", vapidPublicKey, vapidPrivateKey);
}

// In-memory only — fine for now, will not survive a backend restart.
const subscriptions: webpush.PushSubscription[] = [];

export const pushRouter = Router();

pushRouter.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

pushRouter.post("/subscribe", (req, res) => {
  const subscription = req.body as webpush.PushSubscription;
  const alreadyKnown = subscriptions.some((sub) => sub.endpoint === subscription.endpoint);
  if (!alreadyKnown) {
    subscriptions.push(subscription);
  }
  res.status(201).json({ status: "subscribed" });
});

// Test trigger — exposed with no auth/params for now so it's easy to hit from
// a browser bar or curl while wiring this up.
pushRouter.get("/test", async (_req, res) => {
  const payload = JSON.stringify({
    title: "EPOS test notification",
    body: "Push notifications are wired up correctly.",
  });

  const results = await Promise.allSettled(
    subscriptions.map((subscription) => webpush.sendNotification(subscription, payload))
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;

  res.json({ subscribers: subscriptions.length, sent, failed });
});
