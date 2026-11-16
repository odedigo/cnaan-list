/* Hands an Android share to the server, and shows event reminder pushes. */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share" || url.searchParams.has("relay")) return;
  event.respondWith(receiveShare(event.request));
});

self.addEventListener("push", (event) => {
  const notifications = readReminders(event);
  if (notifications.length === 0) return;
  event.waitUntil(Promise.all(notifications.map(showReminder)));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = reminderUrl(event.notification.data);
  event.waitUntil(openReminder(target));
});

function readReminders(event) {
  if (!event.data) return [];
  try {
    const body = event.data.json();
    return Array.isArray(body.notifications) ? body.notifications : [];
  } catch {
    return [];
  }
}

function showReminder(item) {
  const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : "אירוע";
  const body = typeof item.body === "string" ? item.body : "";
  const tag = typeof item.tag === "string" && item.tag ? item.tag : title;
  return self.registration.showNotification(title, {
    body,
    tag,
    lang: "he",
    dir: "rtl",
    icon: "/android-chrome-192x192.png",
    data: { url: typeof item.url === "string" ? item.url : "/dates" },
  });
}

function reminderUrl(data) {
  const path = data && typeof data.url === "string" ? data.url : "/dates";
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) return new URL("/dates", self.location.origin).href;
  return url.href;
}

async function openReminder(url) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    if (typeof client.navigate === "function") await client.navigate(url);
    return client.focus();
  }
  await self.clients.openWindow(url);
}

async function receiveShare(request) {
  const body = await request.formData().catch(() => new FormData());
  const relay = new URL(request.url);
  relay.searchParams.set("relay", "1");
  const forwarded = await fetch(relay, { method: "POST", body, credentials: "same-origin", redirect: "follow" });
  const landing = new URL(forwarded.url, request.url);
  if (landing.origin !== new URL(request.url).origin) return Response.redirect("/recipes?share=1", 303);
  return Response.redirect(landing.toString(), 303);
}
