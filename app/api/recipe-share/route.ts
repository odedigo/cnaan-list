/** Returns the link captured from an Android share, once. */

import { cookies } from "next/headers";

import { readSharePayload, shareCookie } from "@/lib/recipe-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await cookies();
  const payload = readSharePayload(store.get(shareCookie)?.value ?? "");
  store.delete(shareCookie);
  return Response.json(payload);
}
