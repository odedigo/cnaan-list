"use client";

import { useActionState } from "react";
import Link from "next/link";

import { requestPasswordReset } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  return (
    <main className="px-6 py-8">
      <Link href="/settings" className="text-sm text-[var(--teal)]">
        חזרה להגדרות
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">שחזור סיסמה</h1>
      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm">שם משתמש או אימייל</span>
          <input name="identifier" required className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 outline-none focus:border-[var(--teal)]" />
        </label>
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        {state?.message ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
        <button type="submit" disabled={pending} className="w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-60">
          {pending ? "שולח…" : "שליחה"}
        </button>
      </form>
    </main>
  );
}
