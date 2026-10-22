import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type BraveImage = {
  title?: string;
  thumbnail?: { src?: string };
  properties?: { url?: string };
};

export async function GET(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120) ?? "";
  if (!query) return Response.json({ error: "יש להזין חיפוש" }, { status: 400 });

  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return Response.json({ error: "חיפוש התמונות אינו מוגדר" }, { status: 503 });

  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.searchParams.set("q", query);
  url.searchParams.set("search_lang", "he");
  url.searchParams.set("country", "ALL");
  url.searchParams.set("safesearch", "strict");
  url.searchParams.set("count", "8");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return Response.json({ error: "לא ניתן לחפש תמונות" }, { status: 502 });
  }
  if (!response.ok) return braveSearchError(response);

  const body = (await response.json()) as { results?: BraveImage[] };
  const images = (body.results ?? []).flatMap((item) => {
    const thumb = httpsUrl(item.thumbnail?.src);
    const original = httpsUrl(item.properties?.url);
    const source = original ?? thumb;
    if (!thumb || !source) return [];
    return [{ title: item.title?.slice(0, 120) || "תמונה", thumb, url: source }];
  });

  return Response.json({ images });
}

export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  let source = "";
  try {
    const body = (await request.json()) as { url?: unknown };
    source = typeof body.url === "string" ? body.url : "";
  } catch {
    return Response.json({ error: "לא ניתן להוריד את התמונה" }, { status: 400 });
  }

  try {
    const image = await downloadImage(source);
    return new Response(Buffer.from(image.bytes), {
      headers: { "content-type": image.type, "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "large" ? "התמונה גדולה מדי" : "לא ניתן להוריד את התמונה";
    return Response.json({ error: message }, { status: 400 });
  }
}

function httpsUrl(value: string | undefined) {
  return value?.startsWith("https://") ? value : null;
}

async function braveSearchError(response: Response) {
  const body = (await response.json().catch(() => null)) as { message?: string; error?: { detail?: string; message?: string } } | null;
  const message = body?.error?.detail ?? body?.error?.message ?? body?.message ?? "";
  if (response.status === 429 || /quota|rate/i.test(message)) {
    return Response.json({ error: "חריגה ממכסת החיפוש" }, { status: 429 });
  }
  if (response.status === 401 || response.status === 403) {
    return Response.json({ error: "מפתח החיפוש של Brave אינו תקין" }, { status: 503 });
  }
  return Response.json({ error: "לא ניתן לחפש תמונות" }, { status: 502 });
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "יש להתחבר" }, { status: 401 });
  return null;
}

async function downloadImage(start: string) {
  let current = start;
  let response: Response | null = null;
  for (let hop = 0; hop < 3; hop += 1) {
    await assertPublicHttps(current);
    response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location) throw new Error("redirect");
    current = new URL(location, current).toString();
    response = null;
  }
  if (!response?.ok || !response.body) throw new Error("download");

  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) throw new Error("type");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error("large");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error("large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, type };
}

async function assertPublicHttps(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("url");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("url");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
  if (addresses.length === 0 || addresses.some(isPrivateIp)) throw new Error("url");
}

function isPrivateIp(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateIp(normalized.slice("::ffff:".length));
  const parts = normalized.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
