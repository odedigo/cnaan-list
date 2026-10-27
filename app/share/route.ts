/** Accepts an Android share and keeps the link for the recipes page. */

import { NextResponse } from "next/server";

import { clipShare, shareCookie, sharePayload } from "@/lib/recipe-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return remember(request, url.searchParams.get("title") ?? "", url.searchParams.get("text") ?? "", url.searchParams.get("url") ?? "");
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  return remember(request, clipShare(form?.get("title"), 300), clipShare(form?.get("text"), 2500), clipShare(form?.get("url"), 1000));
}

function remember(request: Request, title: string, text: string, url: string) {
  const target = new URL("/recipes?share=1", request.url);
  const response = NextResponse.redirect(target, 303);
  if (title.trim() || text.trim() || url.trim()) {
    response.cookies.set(shareCookie, sharePayload(title, text, url), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 180 });
  }
  return response;
}
