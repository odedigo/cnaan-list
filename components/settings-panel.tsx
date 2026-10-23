"use client";

/** Settings: signed-out login, account switch, stores with the color picker, and app options. */

import { useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { readShowStoreBadge, writeShowStoreBadge } from "@/lib/store-badge";
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
  const [showStoreBadge, setShowStoreBadge] = useState(true);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [userId, setUserId] = useState("");
  useEffect(() => {
    setKeepAwake(readKeepAwake());
    setSingleCategory(readSingleOpenCategory());
    setShowStoreBadge(readShowStoreBadge());
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
          <label className="mt-3 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={showStoreBadge}
              onChange={(event) => {
                const enabled = event.target.checked;
                setShowStoreBadge(enabled);
                writeShowStoreBadge(enabled);
              }}
              className="size-5 accent-[var(--teal)]"
            />
            <span>הצגת תג החנות ברשימת המוצרים</span>
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
  const singleAccount = accounts.length < 2;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-6 py-6">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-base leading-none">חשבון:</span>
        <div className="relative min-w-0 flex-1">
          <select
            aria-label="חשבון"
            value={value}
            disabled={pending || singleAccount}
            onChange={(event) => onChange(event.target.value)}
            className="w-full appearance-none rounded-lg border border-neutral-300 bg-white outline-none focus:border-[var(--teal)] disabled:bg-neutral-100 disabled:text-neutral-500"
            style={{
              appearance: "none",
              WebkitAppearance: "none",
              height: "3rem",
              paddingInlineStart: "1rem",
              paddingInlineEnd: "2.75rem",
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
  const [colorEdit, setColorEdit] = useState<{ id: string | null; name: string; color: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const colorTimers = useRef<Record<string, number>>({});
  const savedTimer = useRef<number | null>(null);
  useEffect(() => {
    const timers = colorTimers.current;
    return () => {
      for (const timer of Object.values(timers)) window.clearTimeout(timer);
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    };
  }, []);

  function hideSaved() {
    setSaved(false);
    if (savedTimer.current) {
      window.clearTimeout(savedTimer.current);
      savedTimer.current = null;
    }
  }

  function showSaved() {
    setMessage(null);
    setSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => {
      savedTimer.current = null;
      setSaved(false);
    }, 2000);
  }

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
    hideSaved();
    const error = await lists.saveStore({ id, name });
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    clearDraft(id);
    showSaved();
  }

  function queueColor(id: string, color: string) {
    setColors((current) => ({ ...current, [id]: color }));
    window.clearTimeout(colorTimers.current[id]);
    colorTimers.current[id] = window.setTimeout(() => {
      void (async () => {
        setMessage(null);
        hideSaved();
        const error = await lists.saveStore({ id, color });
        if (error) setMessage(error);
        else {
          setColors((current) => {
            if (current[id] !== color) return current;
            const next = { ...current };
            delete next[id];
            return next;
          });
          showSaved();
        }
      })();
    }, 300);
  }

  async function createStore() {
    setBusy(true);
    setMessage(null);
    hideSaved();
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
    hideSaved();
    const error = await lists.deleteStore(id);
    setBusy(false);
    setConfirmId(null);
    if (error) setMessage(error);
  }

  return (
    <div className="mt-4 rounded-xl border border-neutral-200 bg-white px-4 py-4 text-start">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <h2 className="text-base font-semibold">חנויות</h2>
        <ChevronIcon className={`size-5 ${open ? "" : "rotate-180"}`} />
      </button>
      {open ? (
      <>
      {lists.storesError ? <p className="mt-2 text-sm text-red-600">{lists.storesError}</p> : null}
      {message ? (
        <p className="mt-2 text-sm text-red-600" role="status">{message}</p>
      ) : saved ? (
        <p className="mt-2 text-sm text-[var(--teal)]" role="status">נשמר</p>
      ) : null}
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
            <button
              type="button"
              aria-label={`צבע ${store.name}`}
              disabled={busy}
              onClick={() =>
                setColorEdit({
                  id: store.id,
                  name: store.name,
                  color: colorHex(colors[store.id] ?? store.color),
                })
              }
              className="size-10 shrink-0 rounded-lg border border-neutral-300 disabled:opacity-60"
              style={{ background: colorHex(colors[store.id] ?? store.color) }}
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
        <button
          type="button"
          aria-label="צבע חנות חדשה"
          disabled={busy}
          onClick={() => setColorEdit({ id: null, name: "חנות חדשה", color: colorHex(addColor) })}
          className="size-10 shrink-0 rounded-lg border border-neutral-300 disabled:opacity-60"
          style={{ background: colorHex(addColor) }}
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
      </>
      ) : null}
      {colorEdit ? (
        <StoreColorDialog
          color={colorEdit.color}
          name={colorEdit.name}
          onClose={() => setColorEdit(null)}
          onSave={(color) => {
            if (colorEdit.id) queueColor(colorEdit.id, color);
            else setAddColor(color);
            setColorEdit(null);
          }}
        />
      ) : null}
    </div>
  );
}

function StoreColorDialog({
  color,
  name,
  onClose,
  onSave,
}: {
  color: string;
  name: string;
  onClose: () => void;
  onSave: (color: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initial = colorHex(color);
  const [hex, setHex] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const hsv = hexToHsv(hex);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  function choose(next: string) {
    const normalized = colorHex(next);
    setHex(normalized);
    setDraft(normalized);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={`צבע ${name}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        width: "100%",
        height: "100dvh",
        maxWidth: "none",
        maxHeight: "none",
        margin: 0,
        boxSizing: "border-box",
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingRight: "max(16px, env(safe-area-inset-right))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        paddingLeft: "max(16px, env(safe-area-inset-left))",
        border: "none",
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        dir="rtl"
        style={{
          width: "100%",
          maxWidth: 340,
          maxHeight: "100%",
          overflowY: "auto",
          borderRadius: 16,
          background: "#fff",
          padding: "1.25rem",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.28)",
        }}
      >
        <p className="text-base font-semibold">צבע {name}</p>
        <div dir="ltr" style={{ display: "flex", gap: 10, height: 196, marginTop: 12 }}>
          <SaturationField hsv={hsv} onChange={(next) => choose(hsvToHex(next.h, next.s, next.v))} />
          <HueField hue={hsv.h} onChange={(hue) => choose(hsvToHex(hue, hsv.s, hsv.v))} />
        </div>
        <div dir="ltr" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 8, border: "1px solid #d4d4d4", background: hex }} />
          <input
            aria-label="קוד צבע"
            dir="ltr"
            value={draft}
            spellCheck={false}
            onChange={(event) => {
              const text = event.target.value.toUpperCase();
              setDraft(text);
              if (/^#[0-9A-F]{6}$/.test(text)) setHex(text);
            }}
            onBlur={() => setDraft(hex)}
            style={{
              minWidth: 0,
              flex: 1,
              borderRadius: 8,
              border: "1px solid #d4d4d4",
              padding: "8px 12px",
              fontFamily: "ui-monospace, monospace",
              fontSize: 16,
              textTransform: "uppercase",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, borderRadius: 12, background: "#f5f5f5", padding: "12px 0", fontWeight: 500, color: "#404040" }}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => onSave(hex)}
            style={{ flex: 1, borderRadius: 12, background: "var(--teal)", padding: "12px 0", fontWeight: 500, color: "#fff" }}
          >
            שמירה
          </button>
        </div>
      </div>
    </dialog>
  );
}

function SaturationField({ hsv, onChange }: { hsv: Hsv; onChange: (hsv: Hsv) => void }) {
  function pick(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange({
      h: hsv.h,
      s: clamp((event.clientX - rect.left) / rect.width),
      v: 1 - clamp((event.clientY - rect.top) / rect.height),
    });
  }
  return (
    <div
      role="application"
      aria-label="רוויה ובהירות"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pick(event);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        pick(event);
      }}
      style={{
        position: "relative",
        flex: 1,
        borderRadius: 2,
        touchAction: "none",
        background: `hsl(${hsv.h} 100% 50%)`,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, #fff, transparent)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent, #000)" }} />
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: `${hsv.s * 100}%`,
          top: `${(1 - hsv.v) * 100}%`,
          width: 14,
          height: 14,
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          border: "2px solid #fff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.55)",
        }}
      />
    </div>
  );
}

function HueField({ hue, onChange }: { hue: number; onChange: (hue: number) => void }) {
  function pick(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange(clamp((event.clientY - rect.top) / rect.height) * 360);
  }
  return (
    <div
      role="slider"
      aria-label="גוון"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hue)}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pick(event);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        pick(event);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 4 : -4;
        onChange((hue + delta + 360) % 360);
      }}
      style={{
        position: "relative",
        width: 18,
        flexShrink: 0,
        borderRadius: 2,
        touchAction: "none",
        background: "linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: `${(hue / 360) * 100}%`,
          width: 22,
          height: 8,
          borderRadius: 2,
          transform: "translate(-50%, -50%)",
          background: `hsl(${hue} 100% 50%)`,
          border: "2px solid #fff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.55)",
        }}
      />
    </div>
  );
}

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
  const value = Number.parseInt(colorHex(hex).slice(1), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex(hue: number, saturation: number, value: number) {
  const chroma = value * saturation;
  const match = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const base = value - chroma;
  const channels =
    hue < 60
      ? [chroma, match, 0]
      : hue < 120
        ? [match, chroma, 0]
        : hue < 180
          ? [0, chroma, match]
          : hue < 240
            ? [0, match, chroma]
            : hue < 300
              ? [match, 0, chroma]
              : [chroma, 0, match];
  const part = (channel: number) =>
    Math.round((channel + base) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(channels[0])}${part(channels[1])}${part(channels[2])}`.toUpperCase();
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
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

