"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { login, logout } from "@/app/actions/auth";
import { AppHeader } from "@/components/app-header";
import { ChevronIcon, UserIcon } from "@/components/icons";
import { useLists } from "@/components/lists-provider";
import { colorHex } from "@/lib/colors";
import { readKeepAwake, writeKeepAwake } from "@/lib/keep-awake";
import {
  readSavedAccounts,
  savedAccountsEvent,
  switchToSavedAccount,
  type SavedAccount,
} from "@/lib/saved-accounts";
import {
  readSingleOpenCategory,
  writeSingleOpenCategory,
} from "@/lib/single-category";
import { createClient } from "@/lib/supabase/client";
import { isProduction } from "@/lib/supabase/env";

export function SignedOutSettings({
  configured,
  authError,
  version = "",
}: {
  configured: boolean;
  authError?: string;
  version?: string;
}) {
  const [state, action, pending] = useActionState(login, null);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  useEffect(() => {
    const sync = () => {
      const saved = readSavedAccounts();
      setAccounts(saved);
      setSelectedId((current) =>
        saved.some((account) => account.userId === current)
          ? current
          : (saved[0]?.userId ?? ""),
      );
    };
    sync();
    window.addEventListener(savedAccountsEvent, sync);
    return () => window.removeEventListener(savedAccountsEvent, sync);
  }, []);
  return (
    <div>
      <AppHeader title="הגדרות" actionsEnabled={false} showCredit creditVersion={version} />
      <DevBanner />
      <AppTitle />
      {accounts.length > 0 ? (
        <div className="px-4 pt-4">
          <AccountCard
            accounts={accounts}
            value={selectedId}
            pending={switching}
            actionPending={switching}
            actionLabel="כניסה"
            pendingLabel="מתחבר…"
            error={switchError}
            onChange={setSelectedId}
            onAction={() => {
              if (!selectedId) return;
              setSwitching(true);
              setSwitchError("");
              void switchToSavedAccount(selectedId).then((message) => {
                if (message) {
                  setSwitchError(message);
                  setSwitching(false);
                }
              });
            }}
          />
        </div>
      ) : null}
      <form
        className={`mx-4 space-y-4 rounded-xl border border-neutral-200 bg-white px-4 py-6 ${accounts.length > 0 ? "mt-4" : "mt-8"}`}
        action={action}
      >
        {accounts.length > 0 ? (
          <p className="text-sm text-neutral-500">חשבון אחר</p>
        ) : null}
        {!configured ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            חסרים פרטי החיבור ל-Supabase. העתיקו את .env.example אל .env.local
            לפי ההסבר ב-README.
          </p>
        ) : null}
        {authError ? (
          <p className="text-sm text-red-600">
            הקישור לאימות אינו תקין או שפג תוקפו.
          </p>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-sm">שם משתמש</span>
          <input
            name="username"
            autoComplete="username"
            required
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 outline-none focus:border-[var(--teal)]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">סיסמה</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 outline-none focus:border-[var(--teal)]"
          />
        </label>
        {state?.error ? (
          <p className="text-sm text-red-600">{state.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-60"
        >
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
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [keepAwake, setKeepAwake] = useState(false);
  const [singleCategory, setSingleCategory] = useState(true);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [userId, setUserId] = useState("");
  useEffect(() => {
    setKeepAwake(readKeepAwake());
    setSingleCategory(readSingleOpenCategory());
    const sync = () => setAccounts(readSavedAccounts());
    sync();
    window.addEventListener(savedAccountsEvent, sync);
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUserId(data.session.user.id);
    });
    return () => window.removeEventListener(savedAccountsEvent, sync);
  }, []);
  const savedCurrent = accounts.find(
    (account) =>
      account.userId === userId || (!userId && account.username === username),
  );
  const currentValue = userId || savedCurrent?.userId || "";
  const currentOption: SavedAccount = {
    userId: currentValue,
    username,
    email: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: null,
    usedAt: 0,
    production: isProduction(),
  };
  const options =
    accounts.length === 0
      ? [currentOption]
      : currentValue &&
          !accounts.some((account) => account.userId === currentValue)
        ? [...accounts, currentOption]
        : accounts;
  async function handleLogout() {
    setPending(true);
    try {
      await logout();
    } finally {
      window.location.assign("/settings");
    }
  }
  return (
    <div>
      <DevBanner />
      <div className="px-4 pt-4 pb-8">
        <AccountCard
          accounts={options}
          value={currentValue}
          pending={pending || switching}
          actionPending={pending}
          actionLabel="התנתקות"
          pendingLabel="מתנתק…"
          error={switchError}
          onChange={(nextId) => {
            if (!nextId || nextId === currentValue) return;
            setSwitching(true);
            setSwitchError("");
            void switchToSavedAccount(nextId).then((message) => {
              if (message) {
                setSwitchError(message);
                setSwitching(false);
              }
            });
          }}
          onAction={() => void handleLogout()}
        />
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
        <StoresEditor />
      </div>
    </div>
  );
}

function AccountCard({
  accounts,
  value,
  pending,
  actionPending,
  actionLabel,
  pendingLabel,
  error,
  onChange,
  onAction,
}: {
  accounts: SavedAccount[];
  value: string;
  pending: boolean;
  actionPending: boolean;
  actionLabel: string;
  pendingLabel: string;
  error: string;
  onChange: (userId: string) => void;
  onAction: () => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-6 py-6">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-base leading-none">חשבון:</span>
        <div className="relative min-w-0 flex-1">
          <select
            aria-label="חשבון"
            value={value}
            disabled={pending || accounts.length === 0}
            onChange={(event) => onChange(event.target.value)}
            className="w-full appearance-none rounded-lg border border-neutral-300 bg-white outline-none focus:border-[var(--teal)]"
            style={{
              appearance: "none",
              WebkitAppearance: "none",
              height: "3rem",
              paddingInlineStart: "1rem",
              paddingInlineEnd: "2.5rem",
            }}
          >
            {accounts.map((account) => (
              <option
                key={account.userId || account.username}
                value={account.userId}
              >
                {account.username}
              </option>
            ))}
          </select>
          <ChevronIcon
            className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 rotate-180 text-neutral-600"
            style={{ insetInlineEnd: "0.75rem" }}
          />
        </div>
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-neutral-200 text-neutral-500">
          <UserIcon className="size-7" />
        </span>
      </div>
      <div className="flex justify-center" style={{ marginTop: "1.25rem" }}>
        <button
          type="button"
          disabled={pending}
          onClick={onAction}
          className="rounded-lg bg-[var(--teal)] px-6 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {actionPending ? pendingLabel : actionLabel}
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-center text-sm text-red-600">{error}</p>
      ) : null}
    </div>
  );
}

function StoresEditor() {
  const lists = useLists();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState("");
  const [addColor, setAddColor] = useState("#2563EB");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const colorTimers = useRef<Record<string, number>>({});
  useEffect(() => {
    const timers = colorTimers.current;
    return () => {
      for (const timer of Object.values(timers)) window.clearTimeout(timer);
    };
  }, []);

  function clearDraft(id: string) {
    setDrafts((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function commitName(id: string) {
    const store = lists.stores.find((entry) => entry.id === id);
    if (!store) return;
    const name = (drafts[id] ?? store.name).trim();
    if (name === store.name) {
      clearDraft(id);
      return;
    }
    setBusy(true);
    setMessage(null);
    const error = await lists.saveStore({ id, name });
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    clearDraft(id);
  }

  function queueColor(id: string, color: string) {
    setColors((current) => ({ ...current, [id]: color }));
    window.clearTimeout(colorTimers.current[id]);
    colorTimers.current[id] = window.setTimeout(() => {
      void (async () => {
        setMessage(null);
        const error = await lists.saveStore({ id, color });
        if (error) setMessage(error);
        else setColors((current) => {
          if (current[id] !== color) return current;
          const next = { ...current };
          delete next[id];
          return next;
        });
      })();
    }, 300);
  }

  async function createStore() {
    setBusy(true);
    setMessage(null);
    const error = await lists.addStore(adding, addColor);
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    setAdding("");
    setAddColor("#2563EB");
  }

  async function removeStore(id: string) {
    setBusy(true);
    setMessage(null);
    const error = await lists.deleteStore(id);
    setBusy(false);
    setConfirmId(null);
    if (error) setMessage(error);
  }

  return (
    <div className="mt-4 rounded-xl border border-neutral-200 bg-white px-4 py-4 text-start">
      <h2 className="text-base font-semibold">חנויות</h2>
      {lists.storesError ? <p className="mt-2 text-sm text-red-600">{lists.storesError}</p> : null}
      <div className="mt-3 space-y-2">
        {lists.stores.map((store) => (
          <div key={store.id} className="flex items-center gap-2">
            <input
              aria-label={`שם ${store.name}`}
              value={drafts[store.id] ?? store.name}
              disabled={busy}
              onChange={(event) => setDrafts((current) => ({ ...current, [store.id]: event.target.value }))}
              onBlur={() => void commitName(store.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 outline-none focus:border-[var(--teal)]"
            />
            <input
              type="color"
              aria-label={`צבע ${store.name}`}
              value={colorHex(colors[store.id] ?? store.color).toLowerCase()}
              disabled={busy}
              onChange={(event) => queueColor(store.id, event.target.value)}
              className="size-10 shrink-0 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1"
            />
            {store.protected ? (
              <span className="w-16 shrink-0" />
            ) : confirmId === store.id ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeStore(store.id)}
                className="w-16 shrink-0 rounded-lg bg-red-50 py-2 text-sm text-red-700"
              >
                אישור
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmId(store.id)}
                className="w-16 shrink-0 rounded-lg py-2 text-sm text-red-600"
              >
                מחיקה
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          aria-label="שם חנות חדשה"
          value={adding}
          placeholder="חנות חדשה"
          disabled={busy}
          onChange={(event) => setAdding(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void createStore();
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 outline-none focus:border-[var(--teal)]"
        />
        <input
          type="color"
          aria-label="צבע חנות חדשה"
          value={addColor.toLowerCase()}
          disabled={busy}
          onChange={(event) => setAddColor(event.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1"
        />
        <button
          type="button"
          disabled={busy || !adding.trim()}
          onClick={() => void createStore()}
          className="w-16 shrink-0 rounded-lg bg-[var(--teal)] py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          הוספה
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
    </div>
  );
}

function DevBanner() {
  if (isProduction()) return null;
  return (
    <div role="status" className="px-4 py-4 text-center text-xl font-bold" style={{ background: "#f59e0b", color: "#1c1917" }}>
      סביבת פיתוח
    </div>
  );
}

function AppTitle() {
  return (
    <h2 className="px-6 pt-5 text-center text-lg font-semibold">
      רשימת הקניות של משפחת כנען
    </h2>
  );
}

