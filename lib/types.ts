import type { UnitId } from "@/lib/units";

export type Store = {
  id: string;
  account_id: string;
  name: string;
  color: string;
  sort_order: number;
  protected: boolean;
};

export type Category = {
  id: string;
  account_id: string;
  name: string;
  color: string;
  image_path: string | null;
  sort_order: number;
  store_id: string;
  separator_after: boolean;
  separator_text: string;
};

export type Item = {
  id: string;
  account_id: string;
  category_id: string;
  name: string;
  unit: UnitId;
  comments: string;
  image_path: string | null;
  quantity: number;
  sort_order: number;
};

export type GroceryLine = {
  id: string;
  account_id: string;
  item_id: string;
  checked: boolean;
};

export type ChecklistPriority = "immediate" | "high" | "medium" | "low";

export type ChecklistRow = {
  id: string;
  account_id: string;
  body: string;
  indent: 0 | 1;
  checked: boolean;
  sort_order: number;
  priority: ChecklistPriority | null;
};

export type PackingList = {
  id: string;
  account_id: string;
  name: string;
  favorite: boolean;
  sort_order: number;
};

export type PackingCategory = {
  id: string;
  account_id: string;
  list_id: string;
  name: string;
  color: string;
  sort_order: number;
};

export type PackingItem = {
  id: string;
  account_id: string;
  category_id: string;
  name: string;
  quantity: number;
  checked: boolean;
  sort_order: number;
};

export type EventKind = "birthday" | "anniversary" | "death" | "passing" | "other";

export type AccountEvent = {
  id: string;
  account_id: string;
  kind: EventKind;
  name: string;
  label: string;
  month: number;
  day: number;
  year: number | null;
  comments: string;
  image_path: string | null;
};

export type ListsData = {
  accountId: string;
  username: string;
  categories: Category[];
  items: Item[];
  grocery: GroceryLine[];
  checklist: ChecklistRow[];
  stores: Store[];
  storesReady: boolean;
  packingLists: PackingList[];
  packingCategories: PackingCategory[];
  packingItems: PackingItem[];
  packingReady: boolean;
  events: AccountEvent[];
  eventsReady: boolean;
};
