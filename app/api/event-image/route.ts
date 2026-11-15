/** Downloads a public image from a link so it can be stored without keeping the address. */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { blockedHost } from "@/lib/recipe-link";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const maxBytes = 8_000_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "יש להתחבר" }, { status: 401 });

  let urlText = "";
  try {
    const body = (await request.json()) as { url?: unknown };
    urlText = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return Response.json({ error: "הקישור אינו תקין" }, { status: 400 });
  }

  let current: URL;
  try {
    current = publicUrl(urlText);
  } catch {
    return Response.json({ error: "הקישור אינו תקין" }, { status: 400 });
  }

  try {
    for (let hop = 0; hop < 3; hop += 1) {
      await assertPublic(current);
      const response = await fetch(current, {
        redirect: "manual",
        headers: { accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*;q=0.8" },
        signal: AbortSignal.timeout(12000),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get("location");
        if (!location) return imageError();
        current = publicUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return imageError();
      }
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        return Response.json({ error: "התמונה גדולה מדי" }, { status: 400 });
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return imageError();
      const type = sniffedImageType(bytes);
      if (!type) return imageError();
      return new Response(Buffer.from(bytes), { headers: { "content-type": type, "cache-control": "no-store" } });
    }
  } catch {
    return imageError();
  }
  return imageError();
}

function imageError() {
  return Response.json({ error: "לא ניתן לטעון את התמונה" }, { status: 400 });
}

function publicUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
  if (url.username || url.password) throw new Error("auth");
  return url;
}

async function assertPublic(url: URL) {
  if (blockedHost(url.hostname)) throw new Error("blocked");
  if (isIP(url.hostname)) return;
  const records = await lookup(url.hostname, { all: true });
  if (records.length === 0 || records.some((record) => blockedHost(record.address))) throw new Error("blocked");
}

function sniffedImageType(bytes: Uint8Array) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "";
}
