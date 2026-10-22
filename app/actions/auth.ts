"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { createAdminClient, hasServiceEnv } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailError, passwordError, usernameError } from "@/lib/validation";

export type AuthState = { error?: string; message?: string; ok?: boolean } | null;

const GENERIC_LOGIN_ERROR = "פרטי ההתחברות שגויים";
const RESET_NOTICE = "אם החשבון קיים, נשלח אליך מייל";

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const identifier = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) return { error: GENERIC_LOGIN_ERROR };
  if (!hasServiceEnv()) return { error: "השרת לא מוגדר. בדקו את משתני הסביבה." };

  let email = identifier;
  if (identifier.includes("@")) {
    if (emailError(identifier)) return { error: GENERIC_LOGIN_ERROR };
  } else {
    if (usernameError(identifier)) return { error: GENERIC_LOGIN_ERROR };
    const admin = createAdminClient();
    const { data, error: lookupError } = await admin.rpc("email_for_username", {
      p_username: identifier,
    });
    if (lookupError || typeof data !== "string" || !data) return { error: GENERIC_LOGIN_ERROR };
    email = data;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "יש לאשר את האימייל לפני הכניסה" };
    }
    return { error: GENERIC_LOGIN_ERROR };
  }
  return { ok: true };
}

export async function logout() {
  const supabase = await createClient();
  // Local scope ends this browser only. Other devices on the same account stay signed in.
  await supabase.auth.signOut({ scope: "local" });
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) cookieStore.delete(cookie.name);
  }
}

export async function signup(_state: AuthState, formData: FormData): Promise<AuthState> {
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const usernameMessage = usernameError(username);
  if (usernameMessage) return { error: usernameMessage };
  const emailMessage = emailError(email);
  if (emailMessage) return { error: emailMessage };
  const passwordMessage = passwordError(password);
  if (passwordMessage) return { error: passwordMessage };
  if (password !== confirm) return { error: "הסיסמאות אינן תואמות" };
  if (!hasServiceEnv()) return { error: "השרת לא מוגדר. בדקו את משתני הסביבה." };

  const admin = createAdminClient();
  const { data: existing } = await admin.rpc("email_for_username", { p_username: username });
  if (existing) return { error: "שם המשתמש תפוס" };

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${origin}/auth/callback?next=/grocery`,
    },
  });
  if (error) {
    if (error.code === "user_already_exists" || error.message.toLowerCase().includes("already")) {
      return { error: "האימייל כבר רשום" };
    }
    return { error: "לא ניתן ליצור את החשבון" };
  }
  if (data.session) redirect("/settings");
  return { message: "נשלח אליך מייל לאישור החשבון. אחרי האישור אפשר להתחבר." };
}

export async function requestPasswordReset(_state: AuthState, formData: FormData): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) return { message: RESET_NOTICE };
  if (!hasServiceEnv()) return { error: "השרת לא מוגדר. בדקו את משתני הסביבה." };

  let email = identifier;
  if (!identifier.includes("@")) {
    const admin = createAdminClient();
    const { data } = await admin.rpc("email_for_username", { p_username: identifier });
    email = typeof data === "string" ? data : "";
  }
  if (email) {
    const supabase = await createClient();
    const origin = await requestOrigin();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/auth/reset`,
    });
  }
  return { message: RESET_NOTICE };
}

export async function updatePassword(_state: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const passwordMessage = passwordError(password);
  if (passwordMessage) return { error: passwordMessage };
  if (password !== confirm) return { error: "הסיסמאות אינן תואמות" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "לא ניתן לעדכן את הסיסמה. פתחו שוב את הקישור מהמייל." };
  redirect("/settings");
}

async function requestOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
