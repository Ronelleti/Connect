// Service worker for the installed app: shows push notifications and opens the related
// page when one is tapped.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let message = { title: "Wecomconnect", body: "", link: "/" };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // Keep the defaults when the payload is missing or not JSON.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      dir: "rtl",
      lang: "he",
      data: { link: message.link || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        return existing.navigate(url).then((client) => (client ?? existing).focus());
      }
      return self.clients.openWindow(url);
    })
  );
});
