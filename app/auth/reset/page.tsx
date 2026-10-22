"use client";

import { useActionState } from "react";
import Link from "next/link";

import { updatePassword } from "@/app/actions/auth";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, null);
  return (
    <main className="px-6 py-8">
      <Link href="/settings" className="text-sm text-[var(--teal)]">
        חזרה להגדרות
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">סיסמה חדשה</h1>
      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm">סיסמה חדשה</span>
          <input name="password" type="password" autoComplete="new-password" required className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 outline-none focus:border-[var(--teal)]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">אימות סיסמה</span>
          <input name="confirm" type="password" autoComplete="new-password" required className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 outline-none focus:border-[var(--teal)]" />
        </label>
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        <button type="submit" disabled={pending} className="w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-60">
          {pending ? "שומר…" : "שמירה"}
        </button>
      </form>
    </main>
  );
}
