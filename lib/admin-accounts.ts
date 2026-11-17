import "server-only";

import { headers } from "next/headers";

import type { AccountRole, ManagedAccount, UserType } from "@/lib/account-role";
import { isUserType } from "@/lib/account-role";
import { ACCOUNT_SECTIONS, accountSections, type AccountSection } from "@/lib/account-sections";
import { createAdminClient, hasServiceEnv } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type { AccountRole, ManagedAccount };

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (data?.role !== "ADMIN") return null;
  return { id: user.id };
}

export async function listManagedAccounts() {
  if (!hasServiceEnv()) return { error: "השרת לא מוגדר. בדקו את משתני הסביבה." as const, accounts: [] as ManagedAccount[] };
  const admin = createAdminClient();
  const [{ data: profiles, error: profileError }, accountsQuery] = await Promise.all([
    admin.from("profiles").select("id, username, email, role, user_type").order("username"),
    admin.from("accounts").select("id, owner_id, event_reminders, sections"),
  ]);
  const accountsResult = accountsQuery.error?.code === "42703" || accountsQuery.error?.code === "PGRST204"
    ? await admin.from("accounts").select("id, owner_id, event_reminders")
    : accountsQuery;
  const { data: accounts, error: accountError } = accountsResult;
  if (profileError || accountError) return { error: "לא ניתן לטעון את החשבונות" as const, accounts: [] as ManagedAccount[] };

  const byOwner = new Map((accounts ?? []).map((account) => [account.owner_id, account]));
  return {
    error: null,
    accounts: (profiles ?? []).map((profile) => {
      const account = byOwner.get(profile.id);
      return {
        userId: profile.id,
        username: profile.username,
        email: profile.email,
        role: profile.role === "ADMIN" ? "ADMIN" : "USER",
        userType: isUserType(profile.user_type) ? profile.user_type : "NORM",
        accountId: account?.id ?? null,
        eventReminders: account?.event_reminders !== false,
        sections: accountSections((account as { sections?: unknown } | undefined)?.sections),
      } satisfies ManagedAccount;
    }),
  };
}

export async function updateManagedAccount(userId: string, role: AccountRole, userType: UserType, eventReminders: boolean, sections: AccountSection[]) {
  const me = await requireAdmin();
  if (!me) return { error: "אין הרשאה" };
  if (!hasServiceEnv()) return { error: "השרת לא מוגדר. בדקו את משתני הסביבה." };
  if (userId === me.id && role !== "ADMIN") return { error: "אי אפשר להסיר את הרשאת המנהל מעצמך" };
  const nextSections = ACCOUNT_SECTIONS.filter((id) => sections.includes(id));

  const admin = createAdminClient();
  const { error: roleError } = await admin.from("profiles").update({ role, user_type: userType }).eq("id", userId);
  if (roleError) return { error: "לא ניתן לעדכן את החשבון" };

  const { data: account, error: accountError } = await admin.from("accounts").select("id").eq("owner_id", userId).maybeSingle();
  if (accountError) return { error: "לא ניתן לעדכן את החשבון" };
  if (account) {
    const { error } = await admin.from("accounts").update({ event_reminders: eventReminders, sections: nextSections }).eq("id", account.id);
    if (error) return { error: "לא ניתן לעדכן את החשבון" };
  }
  return { ok: true as const };
}

export async function sendManagedPasswordReset(userId: string) {
  const me = await requireAdmin();
  if (!me) return { error: "אין הרשאה" };
  if (!hasServiceEnv()) return { error: "השרת לא מוגדר. בדקו את משתני הסביבה." };

  const admin = createAdminClient();
  const { data: profile, error } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (error || !profile?.email) return { error: "לא ניתן למצוא את החשבון" };

  const supabase = await createClient();
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${proto}://${host}/auth/callback?next=/auth/reset`,
  });
  if (resetError) return { error: "לא ניתן לשלוח קישור לאיפוס הסיסמה" };
  return { ok: true as const, message: "נשלח קישור לאיפוס הסיסמה" };
}
