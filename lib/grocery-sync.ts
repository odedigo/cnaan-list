import type { GroceryLine } from "@/lib/types";

export type PendingGroceryChange = {
  itemId: string;
  checked: boolean;
  localId: string;
  revision: number;
};

function storageKey(accountId: string) {
  return `cnaanlist-grocery-pending:${accountId}`;
}

export function readPendingGrocery(accountId: string): PendingGroceryChange[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingGroceryChange[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry?.itemId && entry.localId && Number.isInteger(entry.revision));
  } catch {
    return [];
  }
}

function writePendingGrocery(accountId: string, entries: PendingGroceryChange[]) {
  if (entries.length === 0) localStorage.removeItem(storageKey(accountId));
  else localStorage.setItem(storageKey(accountId), JSON.stringify(entries));
}

export function rememberPendingGrocery(accountId: string, itemId: string, checked: boolean, localId: string) {
  const entries = readPendingGrocery(accountId);
  const previous = entries.find((entry) => entry.itemId === itemId);
  const next: PendingGroceryChange = {
    itemId,
    checked,
    localId: previous?.localId ?? localId,
    revision: (previous?.revision ?? 0) + 1,
  };
  writePendingGrocery(accountId, [...entries.filter((entry) => entry.itemId !== itemId), next]);
  return next.revision;
}

export function forgetPendingGrocery(accountId: string, itemId: string, revision: number) {
  const entries = readPendingGrocery(accountId);
  const current = entries.find((entry) => entry.itemId === itemId);
  if (!current || current.revision !== revision) return false;
  writePendingGrocery(
    accountId,
    entries.filter((entry) => entry.itemId !== itemId),
  );
  return true;
}

export function mergePendingGrocery(accountId: string, rows: GroceryLine[]) {
  const pending = readPendingGrocery(accountId);
  if (pending.length === 0) return rows;
  const next = rows.map((row) => {
    const change = pending.find((entry) => entry.itemId === row.item_id);
    return change ? { ...row, checked: change.checked } : row;
  });
  for (const change of pending) {
    if (next.some((row) => row.item_id === change.itemId)) continue;
    next.push({
      id: change.localId,
      account_id: accountId,
      item_id: change.itemId,
      checked: change.checked,
    });
  }
  return next;
}

export function isOfflineError(error: { message?: string; name?: string } | null) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const text = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return text.includes("fetch") || text.includes("network") || text.includes("offline") || text.includes("timeout") || text.includes("load failed");
}
