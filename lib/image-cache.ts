const cacheName = "cnaanlist-images";

function cacheRequest(path: string) {
  return new Request(`https://cnaanlist-images.local/${path}`);
}

export async function openImageCache() {
  if (typeof caches === "undefined") return null;
  return caches.open(cacheName);
}

export async function readCachedImage(path: string) {
  const cache = await openImageCache();
  if (!cache) return null;
  const match = await cache.match(cacheRequest(path));
  if (!match) return null;
  return match.blob();
}

export async function writeCachedImage(path: string, blob: Blob) {
  const cache = await openImageCache();
  if (!cache) return;
  await cache.put(
    cacheRequest(path),
    new Response(blob, { headers: { "Content-Type": blob.type || "image/jpeg" } }),
  );
}

export async function pruneImageCache(keep: Set<string>) {
  const cache = await openImageCache();
  if (!cache) return;
  const keys = await cache.keys();
  await Promise.all(
    keys.map(async (request) => {
      const path = decodeURIComponent(new URL(request.url).pathname.slice(1));
      if (!keep.has(path)) await cache.delete(request);
    }),
  );
}
