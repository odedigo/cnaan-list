import { colorHex } from "@/lib/colors";
import { moveVisible, sortByOrder } from "@/lib/order";
import type { PackingCategory, PackingItem, PackingList } from "@/lib/types";

export function normalizePackingList(row: {
  id: string;
  account_id: string;
  name: string;
  favorite?: boolean | null;
  sort_order: number;
}): PackingList {
  return {
    id: row.id,
    account_id: row.account_id,
    name: row.name,
    favorite: row.favorite === true,
    sort_order: row.sort_order,
  };
}

export function normalizePackingCategory(row: {
  id: string;
  account_id: string;
  list_id: string;
  name: string;
  color: string;
  sort_order: number;
}): PackingCategory {
  return {
    id: row.id,
    account_id: row.account_id,
    list_id: row.list_id,
    name: row.name,
    color: colorHex(row.color),
    sort_order: row.sort_order,
  };
}

export function normalizePackingItem(row: {
  id: string;
  account_id: string;
  category_id: string;
  name: string;
  quantity: number | string;
  checked?: boolean | null;
  sort_order: number;
}): PackingItem {
  return {
    id: row.id,
    account_id: row.account_id,
    category_id: row.category_id,
    name: row.name,
    quantity: Number(row.quantity) || 1,
    checked: row.checked === true,
    sort_order: row.sort_order,
  };
}

export function packingName(value: string) {
  const name = value.trim();
  if (!name || name.length > 80) return null;
  return name;
}

export function reorderRows<T extends { id: string; sort_order: number }>(rows: T[], activeId: string, overId: string) {
  const ordered = sortByOrder(rows);
  const ids = ordered.map((row) => row.id);
  const nextIds = moveVisible(ids, ids, activeId, overId);
  if (nextIds.every((id, index) => id === ids[index])) return null;
  const byId = new Map(ordered.map((row) => [row.id, row]));
  return nextIds.flatMap((id, index) => {
    const row = byId.get(id);
    return row ? [{ ...row, sort_order: index }] : [];
  });
}
