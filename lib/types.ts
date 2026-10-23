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

export type ChecklistRow = {
  id: string;
  account_id: string;
  body: string;
  indent: 0 | 1;
  checked: boolean;
  sort_order: number;
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
};
