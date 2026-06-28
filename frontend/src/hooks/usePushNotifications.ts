import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

const apiUrl = import.meta.env.VITE_API_URL ?? "";

export type PushStatus = "unsupported" | "idle" | "subscribing" | "subscribed" | "denied" | "error";

type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>;

async function postSubscription(
  fetchWithAuth: FetchWithAuth,
  subscription: PushSubscription
) {
  const res = await fetchWithAuth("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Could not register device for notifications");
  }
}

export function usePushNotifications(
  fetchWithAuth: FetchWithAuth | null,
  enabled: boolean
) {
  const supported = "serviceWorker" in navigator && "PushManager" in window;
  const [status, setStatus] = useState<PushStatus>(supported ? "idle" : "unsupported");

  const syncExistingSubscription = useCallback(async () => {
    if (!supported || !fetchWithAuth || !enabled) return;
    if (Notification.permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (!existing) return;

    await postSubscription(fetchWithAuth, existing);
    setStatus("subscribed");
  }, [supported, fetchWithAuth, enabled]);

  useEffect(() => {
    if (!supported || !fetchWithAuth || !enabled) return;

    void syncExistingSubscription().catch(() => setStatus("error"));
  }, [supported, fetchWithAuth, enabled, syncExistingSubscription]);

  const subscribe = useCallback(async () => {
    if (!supported || !fetchWithAuth || !enabled) return;
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
        await postSubscription(fetchWithAuth, existing);
        setStatus("subscribed");
        return;
      }

      const { publicKey } = await fetch(`${apiUrl}/api/push/vapid-public-key`).then((res) => res.json());
      if (!publicKey) {
        setStatus("error");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await postSubscription(fetchWithAuth, subscription);
      setStatus("subscribed");
    } catch {
      setStatus("error");
    }
  }, [supported, fetchWithAuth, enabled]);

  return { status, subscribe };
}
