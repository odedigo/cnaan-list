"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { login, logout } from "@/app/actions/auth";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/client";

export function SignedOutSettings({ configured, authError }: { configured: boolean; authError?: string }) {
  const [state, action, pending] = useActionState(login, null);
  useEffect(() => {
    if (state?.ok) window.location.assign("/inventory");
  }, [state]);
  return (
    <div>
      <AppHeader title="הגדרות" actionsEnabled={false} />
      <form
        className="space-y-4 px-6 pt-8"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => {
            action(formData);
          });
        }}
      >
        {!configured ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            חסרים פרטי החיבור ל-Supabase. העתיקו את .env.example אל .env.local לפי ההסבר ב-README.
          </p>
        ) : null}
        {authError ? <p className="text-sm text-red-600">הקישור לאימות אינו תקין או שפג תוקפו.</p> : null}
        <label className="block">
          <span className="mb-1 block text-sm">שם משתמש</span>
          <input name="username" autoComplete="username" required className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 outline-none focus:border-[var(--teal)]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">סיסמה</span>
          <input name="password" type="password" autoComplete="current-password" required className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 outline-none focus:border-[var(--teal)]" />
        </label>
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        <button type="submit" disabled={pending} className="w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-60">
          {pending ? "מתחבר…" : "כניסה"}
        </button>
        <div className="flex justify-between text-sm text-[var(--teal)]">
          <Link href="/signup">יצירת חשבון</Link>
          <Link href="/forgot-password">שכחתי סיסמה</Link>
        </div>
      </form>
    </div>
  );
}

export function SignedInSettings({ username }: { username: string }) {
  const [pending, setPending] = useState(false);
  async function handleLogout() {
    setPending(true);
    try {
      await createClient().auth.signOut({ scope: "local" });
      await logout();
    } finally {
      window.location.assign("/settings");
    }
  }
  return (
    <div className="px-6 pt-16 text-center">
      <p className="text-sm text-neutral-500">מחובר</p>
      <p className="mt-2 text-2xl font-semibold">{username}</p>
      <button type="button" disabled={pending} onClick={() => void handleLogout()} className="mt-8 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-60">
        {pending ? "מתנתק…" : "התנתקות"}
      </button>
    </div>
  );
}
