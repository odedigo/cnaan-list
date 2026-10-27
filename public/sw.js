/* Hands an Android share to the server, then opens the recipes page. */

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

async function receiveShare(request) {
  const body = await request.formData().catch(() => new FormData());
  const relay = new URL(request.url);
  relay.searchParams.set("relay", "1");
  const forwarded = await fetch(relay, { method: "POST", body, credentials: "same-origin", redirect: "follow" });
  const landing = new URL(forwarded.url, request.url);
  if (landing.origin !== new URL(request.url).origin) return Response.redirect("/recipes?share=1", 303);
  return Response.redirect(landing.toString(), 303);
}
