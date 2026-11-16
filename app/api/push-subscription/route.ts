/** Stores the installed app's push subscription for event reminders. */

import { createAdminClient, hasServiceEnv } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const accountId = await ownAccountId();
  if (!accountId) return Response.json({ error: "יש להתחבר" }, { status: 401 });
  const subscription = await readSubscription(request);
  if (!subscription) return Response.json({ error: "ההרשמה אינה תקינה" }, { status: 400 });
  if (!hasServiceEnv()) return Response.json({ error: "התזכורות אינן זמינות" }, { status: 503 });

  const { error } = await createAdminClient().from("push_subscriptions").upsert(
    {
      account_id: accountId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) return Response.json({ error: "לא ניתן לשמור את התזכורת" }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const accountId = await ownAccountId();
  if (!accountId) return Response.json({ error: "יש להתחבר" }, { status: 401 });
  const endpoint = await readEndpoint(request);
  if (!endpoint) return Response.json({ error: "ההרשמה אינה תקינה" }, { status: 400 });
  if (!hasServiceEnv()) return Response.json({ ok: true });

  const { error } = await createAdminClient().from("push_subscriptions").delete().eq("account_id", accountId).eq("endpoint", endpoint);
  if (error) return Response.json({ error: "לא ניתן לבטל את התזכורת" }, { status: 500 });
  return Response.json({ ok: true });
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

async function readSubscription(request: Request) {
  try {
    const body = (await request.json()) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth.trim() : "";
    if (!validEndpoint(endpoint) || p256dh.length < 1 || p256dh.length > 200 || auth.length < 1 || auth.length > 200) return null;
    return { endpoint, p256dh, auth };
  } catch {
    return null;
  }
}

async function readEndpoint(request: Request) {
  try {
    const body = (await request.json()) as { endpoint?: unknown };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    return validEndpoint(endpoint) ? endpoint : null;
  } catch {
    return null;
  }
}

function validEndpoint(endpoint: string) {
  if (endpoint.length < 1 || endpoint.length > 2000) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
