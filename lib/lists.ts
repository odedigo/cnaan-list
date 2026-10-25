import { normalizeChecklist } from "@/lib/checklist";
import { colorHex } from "@/lib/colors";
import { normalizeStore, sortStores } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import type { Category, GroceryLine, Item, ListsData } from "@/lib/types";
import { isUnitId } from "@/lib/units";

export async function loadLists(userId: string): Promise<ListsData | null> {
  const supabase = await createClient();
  const [{ data: profile }, { data: account }] = await Promise.all([
    supabase.from("profiles").select("username").eq("id", userId).maybeSingle(),
    supabase.from("accounts").select("id").eq("owner_id", userId).maybeSingle(),
  ]);
  if (!profile || !account) return null;

  const [{ data: categories }, { data: items }, { data: grocery }, checklistResult, storesResult] = await Promise.all([
    supabase.from("categories").select("*").eq("account_id", account.id).order("sort_order"),
    supabase.from("items").select("*").eq("account_id", account.id).order("sort_order"),
    supabase.from("grocery_items").select("*").eq("account_id", account.id),
    supabase.from("checklist_rows").select("*").eq("account_id", account.id).order("sort_order"),
    supabase.from("stores").select("*").eq("account_id", account.id).order("sort_order"),
  ]);

  return {
    accountId: account.id,
    username: profile.username,
    categories: (categories ?? []).map(normalizeCategory),
    items: (items ?? []).map(normalizeItem),
    grocery: (grocery ?? []).map(normalizeGrocery),
    checklist: checklistResult.error ? [] : (checklistResult.data ?? []).map(normalizeChecklist),
    stores: storesResult.error ? [] : sortStores((storesResult.data ?? []).map(normalizeStore)),
    storesReady: !storesResult.error,
  };
}

function normalizeCategory(row: {
  id: string;
  account_id: string;
  name: string;
  color: string;
  image_path: string | null;
  sort_order: number;
  store_id?: string | null;
  separator_after?: boolean | null;
  separator_text?: string | null;
}): Category {
  return {
    id: row.id,
    account_id: row.account_id,
    name: row.name,
    color: colorHex(row.color),
    image_path: row.image_path,
    sort_order: row.sort_order,
    store_id: row.store_id ?? "",
    separator_after: row.separator_after === true,
    separator_text: typeof row.separator_text === "string" ? row.separator_text : "",
  };
}

function normalizeItem(row: {
  id: string;
  account_id: string;
  category_id: string;
  name: string;
  unit: string;
  comments: string | null;
  image_path: string | null;
  quantity: number | string;
  sort_order: number;
}): Item {
  return {
    id: row.id,
    account_id: row.account_id,
    category_id: row.category_id,
    name: row.name,
    unit: isUnitId(row.unit) ? row.unit : "unit",
    comments: row.comments ?? "",
    image_path: row.image_path,
    quantity: Number(row.quantity) || 1,
    sort_order: row.sort_order,
  };
}

function normalizeGrocery(row: {
  id: string;
  account_id: string;
  item_id: string;
  checked: boolean;
}): GroceryLine {
  return {
    id: row.id,
    account_id: row.account_id,
    item_id: row.item_id,
    checked: row.checked,
  };
}
