"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { colorHex, nextCategoryColor, uniqueCategoryColors } from "@/lib/colors";
import { compressImage } from "@/lib/images";
import { applyOrder, moveVisible, sortByOrder } from "@/lib/order";
import { createClient } from "@/lib/supabase/client";
import type { Category, GroceryLine, Item, ListsData } from "@/lib/types";
import { parseQuantity, type UnitId } from "@/lib/units";

type ListsContextValue = {
  accountId: string;
  username: string;
  categories: Category[];
  items: Item[];
  grocery: GroceryLine[];
  reorderMode: boolean;
  saving: boolean;
  error: string | null;
  imageSrc: (kind: "item" | "category", id: string, path: string | null) => string | null;
  toggleReorder: () => Promise<void>;
  sortAlphabetically: () => Promise<void>;
  moveCategories: (activeId: string, overId: string, visibleIds: string[]) => void;
  moveItems: (categoryId: string, activeId: string, overId: string, visibleIds: string[]) => void;
  addCategory: (name: string, imageFile?: File | null) => Promise<string | null>;
  saveCategory: (input: { id: string; name: string; imageFile?: File | null }) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<void>;
  saveItem: (input: {
    id?: string;
    categoryId: string;
    name: string;
    unit: UnitId;
    comments: string;
    quantity: number;
    imageFile?: File | null;
  }) => Promise<boolean>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  addToGrocery: (itemId: string) => Promise<void>;
  setChecked: (itemId: string, checked: boolean) => Promise<void>;
  removeFromGrocery: (itemId: string) => Promise<void>;
  clearPurchased: () => Promise<void>;
  uploadImage: (kind: "item" | "category", id: string, file: File) => Promise<void>;
  removeImage: (kind: "item" | "category", id: string) => Promise<void>;
};

const ListsContext = createContext<ListsContextValue | null>(null);

export function ListsProvider({ initial, children }: { initial: ListsData; children: ReactNode }) {
  const [categories, setCategories] = useState(initial.categories);
  const [items, setItems] = useState(initial.items);
  const [grocery, setGrocery] = useState(initial.grocery);
  const [reorderMode, setReorderMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const reorderRef = useRef(false);
  const supabaseRef = useRef(createClient());

  const refetch = useCallback(async () => {
    if (reorderRef.current) return;
    const supabase = supabaseRef.current;
    const [{ data: categoryRows }, { data: itemRows }, { data: groceryRows }] = await Promise.all([
      supabase.from("categories").select("*").eq("account_id", initial.accountId).order("sort_order"),
      supabase.from("items").select("*").eq("account_id", initial.accountId).order("sort_order"),
      supabase.from("grocery_items").select("*").eq("account_id", initial.accountId),
    ]);
    if (reorderRef.current) return;
    if (categoryRows) setCategories(categoryRows.map(normalizeCategory));
    if (itemRows) setItems(itemRows.map(normalizeItem));
    if (groceryRows) setGrocery(groceryRows as GroceryLine[]);
  }, [initial.accountId]);

  useEffect(() => {
    const ordered = [...initial.categories].sort((a, b) => a.sort_order - b.sort_order);
    const assigned = uniqueCategoryColors(ordered.map((category) => category.color));
    const changes = ordered.flatMap((category, index) => {
      const color = assigned[index];
      return color && colorHex(category.color) !== color ? [{ id: category.id, color }] : [];
    });
    if (changes.length === 0) return;
    let cancelled = false;
    void (async () => {
      const supabase = supabaseRef.current;
      for (const change of changes) {
        const { error: updateError } = await supabase.from("categories").update({ color: change.color }).eq("id", change.id);
        if (updateError || cancelled) return;
      }
      if (cancelled) return;
      setCategories((current) =>
        current.map((category) => {
          const change = changes.find((entry) => entry.id === category.id);
          return change ? { ...category, color: change.color } : category;
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.categories]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void refetch();
      }, 40);
    };
    const channel = supabase
      .channel(`account-${initial.accountId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter: `account_id=eq.${initial.accountId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `account_id=eq.${initial.accountId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "grocery_items", filter: `account_id=eq.${initial.accountId}` }, schedule)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") schedule();
      });
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [initial.accountId, refetch]);

  const pathsKey = useMemo(() => {
    return [...categories.map((category) => category.image_path), ...items.map((item) => item.image_path)]
      .filter(Boolean)
      .join("|");
  }, [categories, items]);

  useEffect(() => {
    const paths = pathsKey ? pathsKey.split("|") : [];
    if (paths.length === 0) return;
    let cancelled = false;
    void supabaseRef.current.storage
      .from("item-images")
      .createSignedUrls(paths, 60 * 60)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next: Record<string, string> = {};
        for (const entry of data) {
          if (entry.path && entry.signedUrl) next[entry.path] = entry.signedUrl;
        }
        setSignedUrls(next);
      });
    const refresh = window.setInterval(() => {
      void supabaseRef.current.storage
        .from("item-images")
        .createSignedUrls(paths, 60 * 60)
        .then(({ data }) => {
          if (!data) return;
          const next: Record<string, string> = {};
          for (const entry of data) {
            if (entry.path && entry.signedUrl) next[entry.path] = entry.signedUrl;
          }
          setSignedUrls(next);
        });
    }, 50 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [pathsKey]);

  const imageSrc = useCallback(
    (kind: "item" | "category", id: string, path: string | null) => {
      return previews[`${kind}:${id}`] ?? (path ? signedUrls[path] ?? null : null);
    },
    [previews, signedUrls],
  );

  const fail = (message: string) => {
    setError(message);
    void refetch();
  };

  const value = useMemo<ListsContextValue>(() => {
    return {
      accountId: initial.accountId,
      username: initial.username,
      categories: sortByOrder(categories),
      items: sortByOrder(items),
      grocery,
      reorderMode,
      saving,
      error,
      imageSrc,
      async toggleReorder() {
        if (!reorderRef.current) {
          reorderRef.current = true;
          setReorderMode(true);
          return;
        }
        setSaving(true);
        setError(null);
        const supabase = supabaseRef.current;
        const orderedCategories = sortByOrder(categories);
        const { error: categoryError } = await supabase.rpc("reorder_categories", {
          ids: orderedCategories.map((category) => category.id),
        });
        if (categoryError) {
          setSaving(false);
          fail("לא ניתן לשמור את הסדר");
          return;
        }
        const results = await Promise.all(
          orderedCategories.map((category) => {
            const ids = sortByOrder(items.filter((item) => item.category_id === category.id)).map((item) => item.id);
            if (ids.length === 0) return Promise.resolve({ error: null });
            return supabase.rpc("reorder_items", { target_category: category.id, ids });
          }),
        );
        setSaving(false);
        if (results.some((result) => result.error)) {
          fail("לא ניתן לשמור את הסדר");
          return;
        }
        reorderRef.current = false;
        setReorderMode(false);
        await refetch();
      },
      async sortAlphabetically() {
        setSaving(true);
        setError(null);
        reorderRef.current = false;
        setReorderMode(false);
        const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "he", { sensitivity: "base" });
        const nextCategories = [...categories].sort(byName);
        const supabase = supabaseRef.current;
        const { error: categoryError } = await supabase.rpc("reorder_categories", {
          ids: nextCategories.map((category) => category.id),
        });
        if (categoryError) {
          setSaving(false);
          fail("לא ניתן למיין");
          return;
        }
        const results = await Promise.all(
          nextCategories.map((category) => {
            const ids = items
              .filter((item) => item.category_id === category.id)
              .sort(byName)
              .map((item) => item.id);
            if (ids.length === 0) return Promise.resolve({ error: null });
            return supabase.rpc("reorder_items", { target_category: category.id, ids });
          }),
        );
        setSaving(false);
        if (results.some((result) => result.error)) {
          fail("לא ניתן למיין");
          return;
        }
        await refetch();
      },
      moveCategories(activeId, overId, visibleIds) {
        setCategories((current) => {
          const full = sortByOrder(current).map((category) => category.id);
          return applyOrder(current, moveVisible(full, visibleIds, activeId, overId));
        });
      },
      moveItems(categoryId, activeId, overId, visibleIds) {
        setItems((current) => {
          const inCategory = sortByOrder(current.filter((item) => item.category_id === categoryId)).map((item) => item.id);
          const merged = moveVisible(inCategory, visibleIds, activeId, overId);
          const rank = new Map(merged.map((id, index) => [id, index]));
          return sortByOrder(
            current.map((item) =>
              item.category_id === categoryId ? { ...item, sort_order: rank.get(item.id) ?? item.sort_order } : item,
            ),
          );
        });
      },
      async addCategory(name, imageFile) {
        const trimmed = name.trim();
        if (!trimmed) {
          setError("יש להזין שם");
          return null;
        }
        setSaving(true);
        setError(null);
        const sortOrder = categories.reduce((max, category) => Math.max(max, category.sort_order), -1) + 1;
        const color = nextCategoryColor(categories.map((category) => category.color));
        const { data, error: insertError } = await supabaseRef.current
          .from("categories")
          .insert({ account_id: initial.accountId, name: trimmed, color, sort_order: sortOrder })
          .select("*")
          .single();
        if (insertError || !data) {
          setSaving(false);
          fail("לא ניתן להוסיף קטגוריה");
          return null;
        }
        const category = normalizeCategory(data);
        setCategories((current) => [...current, category]);
        if (imageFile) {
          const uploaded = await upload(supabaseRef.current, initial.accountId, "category", category.id, imageFile, setPreviews, setCategories, setItems);
          setSaving(false);
          if (!uploaded) fail("הקטגוריה נשמרה, אבל התמונה לא");
        } else {
          setSaving(false);
        }
        return category.id;
      },
      async saveCategory(input) {
        const name = input.name.trim();
        if (!name) {
          setError("יש להזין שם");
          return false;
        }
        setSaving(true);
        setError(null);
        const { error: updateError } = await supabaseRef.current.from("categories").update({ name }).eq("id", input.id);
        if (updateError) {
          setSaving(false);
          fail("לא ניתן לשמור את הקטגוריה");
          return false;
        }
        setCategories((current) => current.map((category) => (category.id === input.id ? { ...category, name } : category)));
        if (input.imageFile) {
          const uploaded = await upload(supabaseRef.current, initial.accountId, "category", input.id, input.imageFile, setPreviews, setCategories, setItems);
          setSaving(false);
          if (!uploaded) {
            fail("לא ניתן לשמור את התמונה");
            return false;
          }
        } else {
          setSaving(false);
        }
        return true;
      },
      async deleteCategory(id) {
        setError(null);
        const paths = [
          categories.find((category) => category.id === id)?.image_path,
          ...items.filter((item) => item.category_id === id).map((item) => item.image_path),
        ].filter((path): path is string => Boolean(path));
        if (paths.length > 0) await supabaseRef.current.storage.from("item-images").remove(paths);
        const { error: deleteError } = await supabaseRef.current.from("categories").delete().eq("id", id);
        if (deleteError) {
          fail("לא ניתן למחוק את הקטגוריה");
          return;
        }
        const removedItems = new Set(items.filter((item) => item.category_id === id).map((item) => item.id));
        setCategories((current) => current.filter((category) => category.id !== id));
        setItems((current) => current.filter((item) => item.category_id !== id));
        setGrocery((current) => current.filter((line) => !removedItems.has(line.item_id)));
      },
      async saveItem(input) {
        const name = input.name.trim();
        if (!name) {
          setError("יש להזין שם");
          return false;
        }
        const quantity = parseQuantity(String(input.quantity));
        setSaving(true);
        setError(null);
        const supabase = supabaseRef.current;
        if (input.id) {
          const { error: updateError } = await supabase
            .from("items")
            .update({
              name,
              category_id: input.categoryId,
              unit: input.unit,
              comments: input.comments.trim(),
              quantity,
            })
            .eq("id", input.id);
          if (updateError) {
            setSaving(false);
            fail("לא ניתן לשמור את המוצר");
            return false;
          }
          setItems((current) =>
            current.map((item) =>
              item.id === input.id
                ? { ...item, name, category_id: input.categoryId, unit: input.unit, comments: input.comments.trim(), quantity }
                : item,
            ),
          );
          if (input.imageFile) {
            const uploaded = await upload(supabase, initial.accountId, "item", input.id, input.imageFile, setPreviews, setCategories, setItems);
            setSaving(false);
            if (!uploaded) {
              fail("לא ניתן לשמור את התמונה");
              return false;
            }
          } else {
            setSaving(false);
          }
          return true;
        }
        const sortOrder = items
          .filter((item) => item.category_id === input.categoryId)
          .reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
        const { data, error: insertError } = await supabase
          .from("items")
          .insert({
            account_id: initial.accountId,
            category_id: input.categoryId,
            name,
            unit: input.unit,
            comments: input.comments.trim(),
            quantity,
            sort_order: sortOrder,
          })
          .select("*")
          .single();
        if (insertError || !data) {
          setSaving(false);
          fail("לא ניתן להוסיף מוצר");
          return false;
        }
        const item = normalizeItem(data);
        setItems((current) => [...current, item]);
        if (input.imageFile) {
          const uploaded = await upload(supabase, initial.accountId, "item", item.id, input.imageFile, setPreviews, setCategories, setItems);
          setSaving(false);
          if (!uploaded) {
            fail("המוצר נשמר, אבל התמונה לא");
            return true;
          }
        } else {
          setSaving(false);
        }
        return true;
      },
      async setQuantity(itemId, quantity) {
        const next = parseQuantity(String(quantity));
        setItems((current) => current.map((item) => (item.id === itemId ? { ...item, quantity: next } : item)));
        const { error: updateError } = await supabaseRef.current.from("items").update({ quantity: next }).eq("id", itemId);
        if (updateError) fail("לא ניתן לעדכן את הכמות");
      },
      async addToGrocery(itemId) {
        const existing = grocery.find((line) => line.item_id === itemId);
        const supabase = supabaseRef.current;
        if (!existing) {
          const optimistic: GroceryLine = {
            id: crypto.randomUUID(),
            account_id: initial.accountId,
            item_id: itemId,
            checked: false,
          };
          setGrocery((current) => [...current, optimistic]);
          const { error: insertError } = await supabase.from("grocery_items").insert({
            account_id: initial.accountId,
            item_id: itemId,
            checked: false,
          });
          if (insertError) fail("לא ניתן להוסיף לרשימת הקניות");
          else void refetch();
          return;
        }
        if (existing.checked) {
          setGrocery((current) => current.map((line) => (line.item_id === itemId ? { ...line, checked: false } : line)));
          const { error: updateError } = await supabase.from("grocery_items").update({ checked: false }).eq("id", existing.id);
          if (updateError) fail("לא ניתן לעדכן את רשימת הקניות");
        }
      },
      async setChecked(itemId, checked) {
        const existing = grocery.find((line) => line.item_id === itemId);
        if (!existing || existing.checked === checked) return;
        setGrocery((current) => current.map((line) => (line.item_id === itemId ? { ...line, checked } : line)));
        const { error: updateError } = await supabaseRef.current.from("grocery_items").update({ checked }).eq("id", existing.id);
        if (updateError) fail("לא ניתן לעדכן את רשימת הקניות");
      },
      async removeFromGrocery(itemId) {
        const existing = grocery.find((line) => line.item_id === itemId);
        if (!existing) return;
        setGrocery((current) => current.filter((line) => line.item_id !== itemId));
        const { error: deleteError } = await supabaseRef.current.from("grocery_items").delete().eq("id", existing.id);
        if (deleteError) fail("לא ניתן להסיר מהרשימה");
      },
      async clearPurchased() {
        const ids = grocery.filter((line) => line.checked).map((line) => line.id);
        if (ids.length === 0) return;
        setGrocery((current) => current.filter((line) => !line.checked));
        const { error: deleteError } = await supabaseRef.current.from("grocery_items").delete().in("id", ids);
        if (deleteError) fail("לא ניתן לנקות את הפריטים שנקנו");
      },
      async uploadImage(kind, id, file) {
        setError(null);
        const uploaded = await upload(supabaseRef.current, initial.accountId, kind, id, file, setPreviews, setCategories, setItems);
        if (!uploaded) fail("לא ניתן לשמור את התמונה");
      },
      async removeImage(kind, id) {
        setError(null);
        const currentPath =
          kind === "item" ? items.find((item) => item.id === id)?.image_path : categories.find((category) => category.id === id)?.image_path;
        setPreviews((current) => {
          const key = `${kind}:${id}`;
          if (!current[key]) return current;
          const next = { ...current };
          delete next[key];
          return next;
        });
        if (kind === "item") setItems((current) => current.map((item) => (item.id === id ? { ...item, image_path: null } : item)));
        else setCategories((current) => current.map((category) => (category.id === id ? { ...category, image_path: null } : category)));
        const table = kind === "item" ? "items" : "categories";
        const { error: updateError } = await supabaseRef.current.from(table).update({ image_path: null }).eq("id", id);
        if (updateError) {
          fail("לא ניתן להסיר את התמונה");
          void refetch();
          return;
        }
        if (currentPath) await supabaseRef.current.storage.from("item-images").remove([currentPath]);
      },
    };
  }, [categories, error, grocery, imageSrc, initial.accountId, initial.username, items, refetch, reorderMode, saving]);

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
}

export function useListsOptional() {
  return useContext(ListsContext);
}

export function useLists() {
  const value = useListsOptional();
  if (!value) throw new Error("useLists must be used inside ListsProvider");
  return value;
}

function normalizeCategory(row: {
  id: string;
  account_id: string;
  name: string;
  color: string;
  image_path: string | null;
  sort_order: number;
}): Category {
  return {
    id: row.id,
    account_id: row.account_id,
    name: row.name,
    color: colorHex(row.color),
    image_path: row.image_path,
    sort_order: row.sort_order,
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
  const units = ["unit", "kg", "g", "l", "ml", "pack", "box", "bag", "bottle"] as const;
  const unit = units.find((candidate) => candidate === row.unit) ?? "unit";
  return {
    id: row.id,
    account_id: row.account_id,
    category_id: row.category_id,
    name: row.name,
    unit,
    comments: row.comments ?? "",
    image_path: row.image_path,
    quantity: Number(row.quantity) || 1,
    sort_order: row.sort_order,
  };
}

async function upload(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  kind: "item" | "category",
  id: string,
  file: File,
  setPreviews: (value: (current: Record<string, string>) => Record<string, string>) => void,
  setCategories: (value: (current: Category[]) => Category[]) => void,
  setItems: (value: (current: Item[]) => Item[]) => void,
) {
  const previewUrl = URL.createObjectURL(file);
  const previewKey = `${kind}:${id}`;
  setPreviews((current) => ({ ...current, [previewKey]: previewUrl }));
  try {
    const compressed = await compressImage(file);
    const folder = kind === "item" ? "items" : "categories";
    const extension = compressed.contentType === "image/webp" ? "webp" : "jpg";
    const path = `${accountId}/${folder}/${id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("item-images").upload(path, compressed.blob, {
      contentType: compressed.contentType,
      upsert: false,
    });
    if (uploadError) return false;
    const table = kind === "item" ? "items" : "categories";
    const { data: previous } = await supabase.from(table).select("image_path").eq("id", id).maybeSingle();
    const { error: updateError } = await supabase.from(table).update({ image_path: path }).eq("id", id);
    if (updateError) return false;
    if (previous?.image_path) {
      await supabase.storage.from("item-images").remove([previous.image_path]);
    }
    if (kind === "item") {
      setItems((current) => current.map((item) => (item.id === id ? { ...item, image_path: path } : item)));
    } else {
      setCategories((current) => current.map((category) => (category.id === id ? { ...category, image_path: path } : category)));
    }
    return true;
  } catch {
    return false;
  }
}
