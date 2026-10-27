"use client";

/** New-account form. The registration fields stay hidden until the master password is accepted. */

import { useActionState, useState } from "react";
import Link from "next/link";

import { checkSignupPassword, signup } from "@/app/actions/auth";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, null);
  const [gateState, checkGate, gatePending] = useActionState(checkSignupPassword, null);
  const [gate, setGate] = useState("");
  const open = gateState?.ok === true && gate.length > 0;
  return (
    <main className="px-6 py-8">
      <Link href="/settings" className="text-sm text-[var(--teal)]">
        חזרה להגדרות
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">יצירת חשבון</h1>
      {open ? (
        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="gate" value={gate} />
          <Field name="username" label="שם משתמש" autoComplete="username" />
          <Field name="email" label="אימייל" type="email" autoComplete="email" />
          <Field name="password" label="סיסמה" type="password" autoComplete="new-password" />
          <Field name="confirm" label="אימות סיסמה" type="password" autoComplete="new-password" />
          {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
          {state?.message ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
          <button type="submit" disabled={pending} className="w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-60">
            {pending ? "יוצר חשבון…" : "הרשמה"}
          </button>
        </form>
      ) : (
        <form
          action={checkGate}
          className="mt-6 space-y-4"
          onSubmit={(event) => setGate(String(new FormData(event.currentTarget).get("gate") ?? ""))}
        >
          <Field name="gate" label="סיסמה ראשית" type="password" autoComplete="off" />
          {gateState?.error ? <p className="text-sm text-red-600">{gateState.error}</p> : null}
          <button type="submit" disabled={gatePending} className="w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-60">
            {gatePending ? "בודק…" : "המשך"}
          </button>
        </form>
      )}
    </main>
  );
}

function Field({ name, label, type = "text", autoComplete }: { name: string; label: string; type?: string; autoComplete: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <input name={name} type={type} autoComplete={autoComplete} required className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 outline-none focus:border-[var(--teal)]" />
    </label>
  );
}
