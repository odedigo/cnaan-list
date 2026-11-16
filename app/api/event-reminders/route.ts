/** Sends the daily event reminder push once the configured hour has been reached. */

import { timingSafeEqual } from "node:crypto";

import { sendAccountReminder, sendDueReminders } from "@/lib/event-reminders";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await sendDueReminders();
    return Response.json(result);
  } catch {
    return Response.json({ error: "reminder failed" }, { status: 500 });
  }
}

export async function POST() {
  const accountId = await ownAccountId();
  if (!accountId) return Response.json({ ok: false, message: "יש להתחבר" }, { status: 401 });
  try {
    return Response.json(await sendAccountReminder(accountId));
  } catch {
    return Response.json({ ok: false, message: "לא ניתן לשלוח תזכורת" }, { status: 500 });
  }
}

async function ownAccountId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("accounts").select("id").eq("owner_id", user.id).maybeSingle();
  return data?.id ?? null;
}

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
