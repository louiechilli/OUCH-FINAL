import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Empty by default: nginx proxies /api/* to the backend on the same origin,
// so an absolute URL here would break as soon as this is accessed from
// anything other than the machine running docker compose (e.g. the iPad).
const apiUrl = import.meta.env.VITE_API_URL ?? "";

export type PushStatus = "unsupported" | "idle" | "subscribing" | "subscribed" | "denied" | "error";

async function postSubscription(subscription: PushSubscription) {
  await fetch(`${apiUrl}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
}

export function usePushNotifications() {
  const supported = "serviceWorker" in navigator && "PushManager" in window;
  const [status, setStatus] = useState<PushStatus>(supported ? "idle" : "unsupported");

  // If permission was already granted in a previous visit, re-sync silently —
  // this doesn't need a user gesture since no prompt will be shown.
  useEffect(() => {
    if (!supported || Notification.permission !== "granted") return;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => {
        if (existing) {
          setStatus("subscribed");
          return postSubscription(existing);
        }
      })
      .catch(() => setStatus("error"));
  }, [supported]);

  // Must be called from a direct user gesture (e.g. an onClick handler) —
  // iOS Safari silently ignores Notification.requestPermission() otherwise.
  const subscribe = useCallback(async () => {
    if (!supported) return;
    setStatus("subscribing");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await postSubscription(existing);
        setStatus("subscribed");
        return;
      }

      const { publicKey } = await fetch(`${apiUrl}/api/push/vapid-public-key`).then((res) =>
        res.json()
      );
      if (!publicKey) {
        setStatus("error");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await postSubscription(subscription);
      setStatus("subscribed");
    } catch {
      setStatus("error");
    }
  }, [supported]);

  return { status, subscribe };
}
