import type { UnitId } from "@/lib/units";

export type Category = {
  id: string;
  account_id: string;
  name: string;
  color: string;
  image_path: string | null;
  sort_order: number;
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

export type ListsData = {
  accountId: string;
  username: string;
  categories: Category[];
  items: Item[];
  grocery: GroceryLine[];
};
