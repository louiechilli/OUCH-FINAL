/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? "EPOS";
  const body = data.body ?? "";
  const link = typeof data.link === "string" ? data.link : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { link },
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const link = (event.notification.data?.link as string | undefined) ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          void client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            void client.navigate(link);
          }
          return;
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
