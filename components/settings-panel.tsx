"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { login, logout } from "@/app/actions/auth";
import { AppHeader } from "@/components/app-header";
import { readKeepAwake, writeKeepAwake } from "@/lib/keep-awake";
import { readSingleOpenCategory, writeSingleOpenCategory } from "@/lib/single-category";
import { createClient } from "@/lib/supabase/client";

export function SignedOutSettings({ configured, authError, version = "" }: { configured: boolean; authError?: string; version?: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <div>
      <AppHeader title="הגדרות" actionsEnabled={false} />
      <AppTitle />
      <form className="mx-6 mt-8 space-y-4 rounded-xl border border-neutral-200 bg-white px-4 py-6" action={action}>
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
      <div className="px-6">
        <CreditBox version={version} />
      </div>
    </div>
  );
}

export function SignedInSettings({ username, version = "" }: { username: string; version?: string }) {
  const [pending, setPending] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [singleCategory, setSingleCategory] = useState(true);
  useEffect(() => {
    setKeepAwake(readKeepAwake());
    setSingleCategory(readSingleOpenCategory());
  }, []);
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
    <div className="text-center">
      <AppTitle />
      <div className="px-6 pt-8">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-6">
          <p className="text-sm text-neutral-500">מחובר</p>
          <p className="mt-2 text-2xl font-semibold">{username}</p>
          <button type="button" disabled={pending} onClick={() => void handleLogout()} className="mt-6 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-60">
            {pending ? "מתנתק…" : "התנתקות"}
          </button>
        </div>
        <div className="mt-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-start">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={keepAwake}
              onChange={(event) => {
                const enabled = event.target.checked;
                setKeepAwake(enabled);
                writeKeepAwake(enabled);
              }}
              className="size-5 accent-[var(--teal)]"
            />
            <span>מניעת כיבוי המסך</span>
          </label>
          <label className="mt-3 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={singleCategory}
              onChange={(event) => {
                const enabled = event.target.checked;
                setSingleCategory(enabled);
                writeSingleOpenCategory(enabled);
              }}
              className="size-5 accent-[var(--teal)]"
            />
            <span>קטגוריה אחת פתוחה ברשימת המוצרים</span>
          </label>
        </div>
        <CreditBox version={version} />
      </div>
    </div>
  );
}

function AppTitle() {
  return <h2 className="px-6 pt-5 text-center text-lg font-semibold">רשימת הקניות של משפחת כנען</h2>;
}

function CreditBox({ version }: { version: string }) {
  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 px-6">
      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-center text-sm text-neutral-600">
        <p>פותח על ידי עודד כנען</p>
        <p className="mt-1">כל הזכויות שמורות</p>
        {version ? <p className="mt-1">גרסה {version}</p> : null}
      </div>
    </div>
  );
}
