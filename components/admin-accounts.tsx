"use client";

/** Desktop table of every account. Role and account settings are saved per row. */

import { useState } from "react";
import Link from "next/link";

import { resetManagedPassword, saveManagedAccount } from "@/app/actions/admin";
import type { AccountRole, ManagedAccount } from "@/lib/account-role";
import { userTypeOptions } from "@/lib/account-role";

const roles: { value: AccountRole; label: string }[] = [
  { value: "USER", label: "משתמש" },
  { value: "ADMIN", label: "מנהל" },
];

export function AdminAccounts({ selfId, accounts }: { selfId: string; accounts: ManagedAccount[] }) {
  return (
    <main className="admin-screen">
      <p className="admin-phone">עמוד זה זמין רק במחשב</p>
      <div className="admin-desk mx-auto box-border min-h-dvh w-full px-8 py-8" style={{ maxWidth: "1100px" }}>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">ניהול חשבונות</h1>
          <Link href="/grocery" className="text-sm text-[var(--teal)]">
            חזרה לאפליקציה
          </Link>
        </div>
        <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-start text-neutral-500">
                <th className="px-4 py-3 font-medium">שם</th>
                <th className="px-4 py-3 font-medium">אימייל</th>
                <th className="px-4 py-3 font-medium">תפקיד</th>
                <th className="px-4 py-3 font-medium">סוג</th>
                <th className="px-4 py-3 font-medium">תזכורות</th>
                <th className="px-4 py-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                    אין חשבונות
                  </td>
                </tr>
              ) : (
                accounts.map((account) => <AccountRow key={account.userId} account={account} self={account.userId === selfId} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function AccountRow({ account, self }: { account: ManagedAccount; self: boolean }) {
  const [role, setRole] = useState(account.role);
  const [userType, setUserType] = useState(account.userType);
  const [eventReminders, setEventReminders] = useState(account.eventReminders);
  const [pending, setPending] = useState<"save" | "reset" | null>(null);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  async function save() {
    setPending("save");
    setMessage("");
    try {
      const result = await saveManagedAccount(account.userId, role, userType, eventReminders);
      setOk(!result.error);
      setMessage(result.error ?? "נשמר");
    } catch {
      setOk(false);
      setMessage("לא ניתן לשמור");
    } finally {
      setPending(null);
    }
  }

  async function resetPassword() {
    setPending("reset");
    setMessage("");
    try {
      const result = await resetManagedPassword(account.userId);
      setOk(!result.error);
      setMessage(result.error ?? result.message ?? "נשלח קישור לאיפוס הסיסמה");
    } catch {
      setOk(false);
      setMessage("לא ניתן לשלוח קישור לאיפוס הסיסמה");
    } finally {
      setPending(null);
    }
  }

  return (
    <tr className="border-b border-neutral-100 align-middle last:border-b-0">
      <td className="px-4 py-3">
        <div className="font-medium">{account.username}</div>
        {self ? <div className="text-xs text-neutral-500">החשבון הזה</div> : null}
      </td>
      <td className="px-4 py-3">{account.email}</td>
      <td className="px-4 py-3">
        <select
          aria-label={`תפקיד של ${account.username}`}
          value={role}
          disabled={pending !== null}
          onChange={(event) => setRole(event.target.value === "ADMIN" ? "ADMIN" : "USER")}
          className="rounded-lg border border-neutral-300 bg-white ps-3"
          style={{ height: "2.5rem" }}
        >
          {roles.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          aria-label={`סוג של ${account.username}`}
          value={userType}
          disabled={pending !== null}
          onChange={(event) => setUserType(event.target.value === "PRO" || event.target.value === "PREMIUM" ? event.target.value : "NORM")}
          className="rounded-lg border border-neutral-300 bg-white ps-3"
          style={{ height: "2.5rem" }}
        >
          {userTypeOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={eventReminders}
            disabled={pending !== null || !account.accountId}
            onChange={(event) => setEventReminders(event.target.checked)}
            className="size-5 accent-[var(--teal)]"
          />
          <span>{eventReminders ? "פעילות" : "כבויות"}</span>
        </label>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending !== null} onClick={() => void save()} className="rounded-lg bg-[var(--teal)] px-3 py-2 font-medium text-white disabled:opacity-60">
            {pending === "save" ? "שומר…" : "שמירה"}
          </button>
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => void resetPassword()}
            className="rounded-lg border border-neutral-300 px-3 py-2 disabled:opacity-60"
          >
            {pending === "reset" ? "שולח…" : "איפוס סיסמה"}
          </button>
        </div>
        {message ? <p className={`mt-2 text-xs ${ok ? "text-neutral-600" : "text-red-600"}`}>{message}</p> : null}
      </td>
    </tr>
  );
}
