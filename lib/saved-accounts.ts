import type { Session } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { isProduction } from "@/lib/supabase/env";

const storageKey = "cnaanlist-accounts";
export const savedAccountsEvent = "cnaanlist-accounts";

export type SavedAccount = {
  userId: string;
  username: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  usedAt: number;
  production: boolean;
};

export function readSavedAccounts(): SavedAccount[] {
  return readAllSavedAccounts().filter((account) => account.production === isProduction());
}

export function rememberSession(session: Session, username: string) {
  const userId = session.user.id;
  const accounts = readAllSavedAccounts();
  const previous = accounts.find((account) => account.userId === userId && account.production === isProduction());
  const meta = session.user.user_metadata?.username;
  const metaName = typeof meta === "string" ? meta.trim() : "";
  const name = username.trim() || previous?.username || metaName || session.user.email || userId;
  const next: SavedAccount = {
    userId,
    username: name,
    email: session.user.email ?? previous?.email ?? "",
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    usedAt: Date.now(),
    production: isProduction(),
  };
  writeAccounts([
    next,
    ...accounts.filter((account) => account.userId !== userId || account.production !== next.production),
  ]);
}

export function forgetSavedAccount(userId: string) {
  writeAccounts(
    readAllSavedAccounts().filter((account) => account.userId !== userId || account.production !== isProduction()),
  );
}

export function bindSavedSession(username: string) {
  const supabase = createClient();
  const save = (session: Session | null) => {
    if (session) rememberSession(session, username);
  };
  void supabase.auth.getSession().then(({ data }) => save(data.session));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    save(session);
  });
  return () => data.subscription.unsubscribe();
}

export async function switchToSavedAccount(userId: string) {
  const supabase = createClient();
  const { data: current } = await supabase.auth.getSession();
  if (current.session) {
    const existing = readSavedAccounts().find((account) => account.userId === current.session?.user.id);
    rememberSession(current.session, existing?.username ?? "");
  }
  if (current.session?.user.id === userId) return null;
  const account = readSavedAccounts().find((item) => item.userId === userId);
  if (!account) return "החשבון לא שמור במכשיר זה";
  const { data, error } = await supabase.auth.setSession({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });
  if (error || !data.session) {
    forgetSavedAccount(userId);
    return "פג תוקף הכניסה לחשבון זה. יש להתחבר שוב.";
  }
  rememberSession(data.session, account.username);
  window.location.assign("/grocery");
  return null;
}

function readAllSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedAccount[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((account) => account?.userId && account.refreshToken && account.username)
      .map((account) => ({ ...account, production: savedAccountIsProduction(account) }))
      .sort((a, b) => a.username.localeCompare(b.username, "he"));
  } catch {
    return [];
  }
}

function savedAccountIsProduction(account: SavedAccount) {
  const host = tokenHost(account.accessToken);
  const productionHost = projectHost(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const developmentHost = projectHost(process.env.NEXT_PUBLIC_SUPABASE_URL_DEV);
  if (host && productionHost && host === productionHost) return true;
  if (host && developmentHost && host === developmentHost) return false;
  return account.production === true;
}

function projectHost(url: string | undefined) {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function tokenHost(accessToken: string) {
  const payload = accessToken.split(".")[1];
  if (!payload) return "";
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const json = JSON.parse(atob(padded)) as { iss?: unknown };
    return typeof json.iss === "string" ? projectHost(json.iss) : "";
  } catch {
    return "";
  }
}

function writeAccounts(accounts: SavedAccount[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(accounts));
    window.dispatchEvent(new Event(savedAccountsEvent));
  } catch {
    // The device can refuse storage. Switching still works for the current login.
  }
}
