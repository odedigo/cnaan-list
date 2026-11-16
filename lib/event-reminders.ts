import "server-only";

import { sendNotification, setVapidDetails } from "web-push";

import { eventReminderCopy, eventsWithinDays, normalizeEvent } from "@/lib/events";
import { zonedNow } from "@/lib/reminder-clock";
import { createAdminClient, hasServiceEnv } from "@/lib/supabase/admin";

const reminderLimit = 40;

type SubscriptionRow = {
  id: string;
  account_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  last_reminder_on: string | null;
};

export function reminderSettings() {
  return {
    hour: boundedInt(process.env.EVENT_REMINDER_HOUR, 9, 0, 23),
    days: boundedInt(process.env.EVENT_REMINDER_DAYS, 3, 1, 30),
    timeZone: process.env.EVENT_REMINDER_TIMEZONE?.trim() || "Asia/Jerusalem",
  };
}

export async function sendDueReminders(now = new Date()) {
  const settings = reminderSettings();
  const zoned = zonedNow(settings.timeZone, now);
  if (zoned.hour < settings.hour) return { sent: 0, waiting: true, configured: true };
  if (!hasServiceEnv() || !configureVapid()) return { sent: 0, waiting: false, configured: false };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, account_id, endpoint, p256dh, auth, last_reminder_on")
    .or(`last_reminder_on.is.null,last_reminder_on.lt.${zoned.iso}`);
  if (error) throw new Error(error.message);
  const subscriptions = (data ?? []) as SubscriptionRow[];
  if (subscriptions.length === 0) return { sent: 0, waiting: false, configured: true };

  const enabledAccounts = await reminderAccounts(subscriptions.map((row) => row.account_id));
  const pending = subscriptions.filter((row) => enabledAccounts.has(row.account_id));
  if (pending.length === 0) return { sent: 0, waiting: false, configured: true };

  const events = await loadEvents([...new Set(pending.map((row) => row.account_id))]);
  const byAccount = new Map<string, typeof events>();
  for (const event of events) {
    const list = byAccount.get(event.account_id) ?? [];
    list.push(event);
    byAccount.set(event.account_id, list);
  }

  let sent = 0;
  for (let index = 0; index < pending.length; index += 8) {
    const batch = pending.slice(index, index + 8);
    const results = await Promise.all(batch.map((subscription) => deliver(subscription, byAccount.get(subscription.account_id) ?? [], settings.days, zoned)));
    sent += results.filter(Boolean).length;
  }
  return { sent, waiting: false, configured: true };
}

export async function sendAccountReminder(accountId: string, now = new Date()) {
  const settings = reminderSettings();
  const zoned = zonedNow(settings.timeZone, now);
  if (!hasServiceEnv() || !configureVapid()) return { ok: false, message: "התזכורות אינן מוגדרות" };
  const enabledAccounts = await reminderAccounts([accountId]);
  if (!enabledAccounts.has(accountId)) return { ok: false, message: "תזכורות הארועים כבויות" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, account_id, endpoint, p256dh, auth, last_reminder_on")
    .eq("account_id", accountId);
  if (error) throw new Error(error.message);
  const subscriptions = (data ?? []) as SubscriptionRow[];
  if (subscriptions.length === 0) return { ok: false, message: "אין מכשיר רשום. פתחו את האפליקציה המותקנת ואשרו התראות." };

  const events = await loadEvents([accountId]);
  if (eventsWithinDays(events, settings.days, zoned.date).length === 0) return { ok: false, message: "אין ארועים לימים הקרובים" };

  let sent = 0;
  for (const subscription of subscriptions) {
    if (await deliver(subscription, events, settings.days, zoned, true)) sent += 1;
  }
  if (sent === 0) return { ok: false, message: "לא ניתן לשלוח תזכורת" };
  return { ok: true, message: "נשלחה תזכורת" };
}

async function deliver(subscription: SubscriptionRow, events: ReturnType<typeof normalizeEvent>[], days: number, zoned: ReturnType<typeof zonedNow>, force = false) {
  const due = eventsWithinDays(events, days, zoned.date).slice(0, reminderLimit);
  if (due.length === 0) {
    if (!force) await claim(subscription, zoned.iso);
    return false;
  }
  const claimed = force ? await markReminded(subscription.id, zoned.iso) : await claim(subscription, zoned.iso);
  if (!claimed) return false;

  const notifications: { title: string; body: string; tag: string; url: string }[] = [];
  for (const event of due) {
    const copy = eventReminderCopy(event, zoned.date);
    const item = { title: copy.title, body: copy.body, tag: `event-${event.id}-${zoned.iso}${force ? `-${Date.now()}` : ""}`, url: "/dates" };
    const next = [...notifications, item];
    if (notifications.length > 0 && Buffer.byteLength(JSON.stringify({ notifications: next })) > 3500) break;
    notifications.push(item);
  }
  const payload = JSON.stringify({ notifications });

  try {
    await sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload,
      { TTL: 12 * 60 * 60 },
    );
    return true;
  } catch (error) {
    if (gone(error)) {
      await createAdminClient().from("push_subscriptions").delete().eq("id", subscription.id);
      return false;
    }
    await createAdminClient().from("push_subscriptions").update({ last_reminder_on: subscription.last_reminder_on }).eq("id", subscription.id).eq("last_reminder_on", zoned.iso);
    return false;
  }
}

async function markReminded(id: string, iso: string) {
  const { error } = await createAdminClient().from("push_subscriptions").update({ last_reminder_on: iso }).eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

async function claim(subscription: SubscriptionRow, iso: string) {
  const { data, error } = await createAdminClient()
    .from("push_subscriptions")
    .update({ last_reminder_on: iso })
    .eq("id", subscription.id)
    .or(`last_reminder_on.is.null,last_reminder_on.lt.${iso}`)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function reminderAccounts(accountIds: string[]) {
  const ids = [...new Set(accountIds)];
  const enabled = new Set<string>();
  const admin = createAdminClient();
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await admin.from("accounts").select("id, event_reminders").in("id", ids.slice(index, index + 100));
    if (error) throw new Error(error.message);
    for (const account of data ?? []) {
      if (account.event_reminders !== false) enabled.add(account.id);
    }
  }
  return enabled;
}

async function loadEvents(accountIds: string[]) {
  const admin = createAdminClient();
  const rows = [];
  for (let index = 0; index < accountIds.length; index += 100) {
    const { data, error } = await admin
      .from("events")
      .select("id, account_id, kind, name, label, month, day, year")
      .in("account_id", accountIds.slice(index, index + 100));
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows.map((row) => normalizeEvent({ ...row, comments: "", image_path: null }));
}

function configureVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  if (!publicKey || !privateKey) return false;
  try {
    setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:reminders@cnaanlist.local", publicKey, privateKey);
  } catch {
    return false;
  }
  return true;
}

function gone(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
  return status === 404 || status === 410;
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}
