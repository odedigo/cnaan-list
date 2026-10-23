import { colorHex } from "@/lib/colors";
import type { Store } from "@/lib/types";

export const DEFAULT_STORE_COLOR = "#E6E6E6";

export function normalizeStore(row: {
  id: string;
  account_id: string;
  name: string;
  color: string;
  sort_order: number;
  protected?: boolean | null;
}): Store {
  return {
    id: row.id,
    account_id: row.account_id,
    name: row.name,
    color: colorHex(row.color),
    sort_order: row.sort_order,
    protected: row.protected === true,
  };
}

export function sortStores(stores: Store[]) {
  return [...stores].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "he"));
}

export function defaultStore(stores: Store[]) {
  return stores.find((store) => store.protected) ?? sortStores(stores)[0] ?? null;
}

export function inkFor(color: string) {
  const hex = colorHex(color).slice(1);
  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#262626" : "#ffffff";
}
