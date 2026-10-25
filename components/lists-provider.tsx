"use client";

/** Shared client state for inventory, grocery, stores, and checklists, including Supabase sync. */

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
import { flushSync } from "react-dom";

import {
  changeIndent,
  insertChecklistRow,
  moveChecklistRow,
  normalizeChecklist,
  numberRows,
  siblingInsertIndex,
  sortChecklist,
  withoutChecklistRow,
} from "@/lib/checklist";
import { colorHex, nextCategoryColor, uniqueCategoryColors } from "@/lib/colors";
import { clearPendingGrocery, forgetPendingGrocery, isOfflineError, mergePendingGrocery, readPendingGrocery, rememberPendingGrocery } from "@/lib/grocery-sync";
import { recipesImportedEvent } from "@/lib/recipe-transfer";
import { forgetCachedImage, pruneImageCache, readCachedImage, writeCachedImage } from "@/lib/image-cache";
import { replaceInventory } from "@/lib/import-inventory";
import { compressImage } from "@/lib/images";
import { applyOrder, compareNames, moveVisible, nameInsertIndex, sortByOrder } from "@/lib/order";
import { defaultStore, normalizeStore, sortStores } from "@/lib/stores";
import { createClient } from "@/lib/supabase/client";
import type { Category, ChecklistRow, GroceryLine, Item, ListsData, Store } from "@/lib/types";
import { parseQuantity, type UnitId } from "@/lib/units";

type ListsContextValue = {
  accountId: string;
  username: string;
  categories: Category[];
  stores: Store[];
  storesError: string | null;
  items: Item[];
  grocery: GroceryLine[];
  reorderMode: boolean;
  saving: boolean;
  error: string | null;
  imageSrc: (kind: "item" | "category", id: string, path: string | null) => string | null;
  toggleReorder: () => Promise<void>;
  sortAlphabetically: () => Promise<boolean>;
  moveCategories: (activeId: string, overId: string, visibleIds: string[]) => void;
  moveItems: (categoryId: string, activeId: string, overId: string, visibleIds: string[]) => void;
  addCategory: (name: string, imageFile?: File | null, storeId?: string, separatorAfter?: boolean, separatorText?: string) => Promise<string | null>;
  saveCategory: (input: { id: string; name: string; imageFile?: File | null; storeId?: string; separatorAfter?: boolean; separatorText?: string }) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  saveStore: (input: { id: string; name?: string; color?: string }) => Promise<string | null>;
  addStore: (name: string, color: string) => Promise<string | null>;
  deleteStore: (id: string) => Promise<string | null>;
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
  clearGrocery: () => Promise<void>;
  importInventory: (file: File, options?: { recipes?: "replace" | "append" }, onProgress?: (ratio: number) => void) => Promise<void>;
  checklist: ChecklistRow[];
  checklistError: string | null;
  addChecklistRow: (where: { at: "start" } | { afterId: string }) => string | null;
  setChecklistBody: (id: string, body: string) => Promise<void>;
  setChecklistIndent: (id: string, direction: "increase" | "decrease") => Promise<void>;
  moveChecklist: (activeId: string, overId: string) => Promise<void>;
  setChecklistChecked: (id: string, checked: boolean) => Promise<void>;
  deleteChecklistRow: (id: string) => Promise<void>;
  uploadImage: (kind: "item" | "category", id: string, file: File) => Promise<void>;
  removeImage: (kind: "item" | "category", id: string) => Promise<void>;
};

const ListsContext = createContext<ListsContextValue | null>(null);

export function ListsProvider({ initial, children }: { initial: ListsData; children: ReactNode }) {
  const [categories, setCategories] = useState(initial.categories);
  const [stores, setStores] = useState(initial.stores);
  const [storesReady, setStoresReady] = useState(initial.storesReady);
  const [storesError, setStoresError] = useState<string | null>(initial.storesReady ? null : "לא ניתן לטעון את החנויות");
  const [items, setItems] = useState(initial.items);
  const [grocery, setGrocery] = useState(initial.grocery);
  const [checklist, setChecklist] = useState(initial.checklist);
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageSrcs, setImageSrcs] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const reorderRef = useRef(false);
  const importingRef = useRef(false);
  const supabaseRef = useRef(createClient());
  const checklistRef = useRef(initial.checklist);
  const writeChain = useRef(Promise.resolve());
  const pendingIds = useRef(new Set<string>());
  const pendingDeletes = useRef(new Set<string>());
  const dirtyBody = useRef(new Map<string, string>());
  checklistRef.current = checklist;

  const refetch = useCallback(async () => {
    if (reorderRef.current || importingRef.current) return;
    const supabase = supabaseRef.current;
    const [{ data: categoryRows }, { data: itemRows }, { data: groceryRows }, checklistResult, storesResult] = await Promise.all([
      supabase.from("categories").select("*").eq("account_id", initial.accountId).order("sort_order"),
      supabase.from("items").select("*").eq("account_id", initial.accountId).order("sort_order"),
      supabase.from("grocery_items").select("*").eq("account_id", initial.accountId),
      supabase.from("checklist_rows").select("*").eq("account_id", initial.accountId).order("sort_order"),
      supabase.from("stores").select("*").eq("account_id", initial.accountId).order("sort_order"),
    ]);
    if (reorderRef.current || importingRef.current) return;
    if (categoryRows) setCategories(categoryRows.map(normalizeCategory));
    if (storesResult.error) setStoresError("לא ניתן לטעון את החנויות");
    else if (storesResult.data) {
      setStores(sortStores(storesResult.data.map(normalizeStore)));
      setStoresError(null);
      setStoresReady(true);
    }
    if (itemRows) setItems(itemRows.map(normalizeItem));
    if (groceryRows) setGrocery(mergePendingGrocery(initial.accountId, groceryRows as GroceryLine[]));
    if (checklistResult.error) {
      setChecklistError("לא ניתן לטעון את הרשימות");
    } else if (checklistResult.data) {
      const server = checklistResult.data.map(normalizeChecklist).filter((row) => !pendingDeletes.current.has(row.id));
      const merged = server.map((row) => {
        const dirty = dirtyBody.current.get(row.id);
        return dirty === undefined ? row : { ...row, body: dirty };
      });
      const missing = checklistRef.current.filter(
        (row) => pendingIds.current.has(row.id) && !merged.some((entry) => entry.id === row.id),
      );
      const next = sortChecklist([...merged, ...missing]);
      checklistRef.current = next;
      setChecklist(next);
      setChecklistError(null);
    }
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
    let channel = supabase
      .channel(`account-${initial.accountId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter: `account_id=eq.${initial.accountId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `account_id=eq.${initial.accountId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "grocery_items", filter: `account_id=eq.${initial.accountId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_rows", filter: `account_id=eq.${initial.accountId}` }, schedule);
    if (storesReady) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "stores", filter: `account_id=eq.${initial.accountId}` }, schedule);
    }
    channel.subscribe((status) => {
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
  }, [initial.accountId, refetch, storesReady]);

  const imagePlan = useMemo(() => {
    const onGrocery = new Set(grocery.map((line) => line.item_id));
    const urgent: string[] = [];
    const later: string[] = [];
    const seen = new Set<string>();
    const add = (path: string | null, bucket: string[]) => {
      if (!path || seen.has(path)) return;
      seen.add(path);
      bucket.push(path);
    };
    for (const item of items) {
      if (onGrocery.has(item.id)) add(item.image_path, urgent);
    }
    for (const category of categories) add(category.image_path, later);
    for (const item of items) add(item.image_path, later);
    return { urgent, later, key: [...seen].sort().join("|") };
  }, [categories, grocery, items]);
  const imagePlanRef = useRef(imagePlan);
  imagePlanRef.current = imagePlan;

  useEffect(() => {
    const { urgent, later } = imagePlanRef.current;
    const paths = [...urgent, ...later];
    if (paths.length === 0) {
      setImageSrcs({});
      return;
    }
    let cancelled = false;
    const blobUrls: string[] = [];
    const publish = (path: string, blob: Blob) => {
      const url = URL.createObjectURL(blob);
      blobUrls.push(url);
      setImageSrcs((current) => ({ ...current, [path]: url }));
    };
    const loadGroup = async (group: string[]) => {
      const missing: string[] = [];
      let readIndex = 0;
      const readOne = async () => {
        while (readIndex < group.length) {
          const path = group[readIndex];
          readIndex += 1;
          const blob = await readCachedImage(path);
          if (cancelled) return;
          if (blob) publish(path, blob);
          else missing.push(path);
        }
      };
      await Promise.all(Array.from({ length: Math.min(8, group.length) }, () => readOne()));
      if (cancelled || missing.length === 0) return;
      let next = 0;
      const downloadOne = async () => {
        while (next < missing.length) {
          const path = missing[next];
          next += 1;
          const { data: blob, error: downloadError } = await supabaseRef.current.storage.from("item-images").download(path);
          if (cancelled || downloadError || !blob) continue;
          await writeCachedImage(path, blob);
          if (cancelled) return;
          publish(path, blob);
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, missing.length) }, () => downloadOne()));
    };
    void (async () => {
      await loadGroup(urgent);
      if (cancelled) return;
      await loadGroup(later);
      if (!cancelled) void pruneImageCache(new Set(paths));
    })();
    return () => {
      cancelled = true;
      for (const url of blobUrls) URL.revokeObjectURL(url);
    };
  }, [imagePlan.key]);

  const imageSrc = useCallback(
    (kind: "item" | "category", id: string, path: string | null) => {
      return previews[`${kind}:${id}`] ?? (path ? imageSrcs[path] ?? null : null);
    },
    [previews, imageSrcs],
  );

  const fail = (message: string) => {
    setError(message);
    void refetch();
  };

  const enqueue = useCallback((task: () => Promise<void>) => {
    const run = writeChain.current.then(task, task);
    writeChain.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const persistChecklist = useCallback(
    async (previous: ChecklistRow[], next: ChecklistRow[]) => {
      const supabase = supabaseRef.current;
      const prevById = new Map(previous.map((row) => [row.id, row]));
      const nextIds = new Set(next.map((row) => row.id));
      const inserts = next.filter((row) => !prevById.has(row.id));
      const deletes = previous.filter((row) => !nextIds.has(row.id));
      const updates = next.filter((row) => {
        const old = prevById.get(row.id);
        if (!old) return false;
        return old.body !== row.body || old.indent !== row.indent || old.checked !== row.checked || old.sort_order !== row.sort_order;
      });
      for (const row of inserts) pendingIds.current.add(row.id);
      for (const row of deletes) pendingDeletes.current.add(row.id);
      const results = await Promise.all([
        ...inserts.map((row) =>
          supabase.from("checklist_rows").insert({
            id: row.id,
            account_id: initial.accountId,
            body: row.body,
            indent: row.indent,
            checked: row.checked,
            sort_order: row.sort_order,
          }),
        ),
        ...updates.map((row) =>
          supabase
            .from("checklist_rows")
            .update({
              body: row.body,
              indent: row.indent,
              checked: row.checked,
              sort_order: row.sort_order,
            })
            .eq("id", row.id),
        ),
        ...deletes.map((row) => supabase.from("checklist_rows").delete().eq("id", row.id)),
      ]);
      for (const row of inserts) pendingIds.current.delete(row.id);
      for (const row of deletes) pendingDeletes.current.delete(row.id);
      if (results.some((result) => result.error)) {
        setChecklistError("לא ניתן לשמור את הרשימה");
        await refetch();
        return false;
      }
      setChecklistError(null);
      return true;
    },
    [initial.accountId, refetch],
  );

  const commitChecklist = useCallback(
    (previous: ChecklistRow[], next: ChecklistRow[]) => {
      const ordered = numberRows(next);
      checklistRef.current = ordered;
      flushSync(() => setChecklist(ordered));
      return enqueue(() => persistChecklist(previous, ordered).then(() => undefined));
    },
    [enqueue, persistChecklist],
  );

  const addChecklistRow = useCallback(
    (where: { at: "start" } | { afterId: string }) => {
      const previous = sortChecklist(checklistRef.current);
      const index = "at" in where ? 0 : siblingInsertIndex(previous, where.afterId);
      if (index < 0) return null;
      const source = "at" in where ? null : previous.find((row) => row.id === where.afterId);
      const row: ChecklistRow = {
        id: crypto.randomUUID(),
        account_id: initial.accountId,
        body: "",
        indent: source?.indent ?? 0,
        checked: false,
        sort_order: index,
      };
      void commitChecklist(previous, insertChecklistRow(previous, row, index));
      return row.id;
    },
    [commitChecklist, initial.accountId],
  );

  const setChecklistBody = useCallback(
    (id: string, body: string) => {
      return enqueue(async () => {
        const previous = sortChecklist(checklistRef.current);
        const current = previous.find((row) => row.id === id);
        if (!current || current.body === body) return;
        dirtyBody.current.set(id, body);
        const next = previous.map((row) => (row.id === id ? { ...row, body } : row));
        checklistRef.current = next;
        setChecklist(next);
        const { error: updateError } = await supabaseRef.current.from("checklist_rows").update({ body }).eq("id", id);
        if (dirtyBody.current.get(id) === body) dirtyBody.current.delete(id);
        if (updateError) {
          setChecklistError("לא ניתן לשמור את הרשימה");
          await refetch();
          return;
        }
        setChecklistError(null);
      });
    },
    [enqueue, refetch],
  );

  const setChecklistIndent = useCallback(
    (id: string, direction: "increase" | "decrease") => {
      const previous = sortChecklist(checklistRef.current);
      const next = changeIndent(previous, id, direction);
      if (!next) return Promise.resolve();
      return commitChecklist(previous, next);
    },
    [commitChecklist],
  );

  const moveChecklist = useCallback(
    (activeId: string, overId: string) => {
      const previous = sortChecklist(checklistRef.current);
      const next = moveChecklistRow(previous, activeId, overId);
      if (!next) return Promise.resolve();
      return commitChecklist(previous, next);
    },
    [commitChecklist],
  );

  const setChecklistChecked = useCallback(
    (id: string, checked: boolean) => {
      const previous = sortChecklist(checklistRef.current);
      const current = previous.find((row) => row.id === id);
      if (!current || current.checked === checked) return Promise.resolve();
      const next = previous.map((row) => (row.id === id ? { ...row, checked } : row));
      return commitChecklist(previous, next);
    },
    [commitChecklist],
  );

  const deleteChecklistRow = useCallback(
    (id: string) => {
      const previous = sortChecklist(checklistRef.current);
      if (!previous.some((row) => row.id === id)) return Promise.resolve();
      return commitChecklist(previous, withoutChecklistRow(previous, id));
    },
    [commitChecklist],
  );

  const syncingGrocery = useRef({ running: false, again: false });
  const syncPendingGrocery = useCallback(async () => {
    if (syncingGrocery.current.running) {
      syncingGrocery.current.again = true;
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    syncingGrocery.current.running = true;
    let paused = false;
    const supabase = supabaseRef.current;
    try {
      for (;;) {
        const entry = readPendingGrocery(initial.accountId)[0];
        if (!entry) break;
        let outcome: "ok" | "offline" | "rejected" = "ok";
        try {
          const { data, error } = await supabase
            .from("grocery_items")
            .select("id")
            .eq("account_id", initial.accountId)
            .eq("item_id", entry.itemId)
            .maybeSingle();
          if (error) outcome = isOfflineError(error) ? "offline" : "rejected";
          else if (
            !readPendingGrocery(initial.accountId).some(
              (row) => row.itemId === entry.itemId && row.revision === entry.revision,
            )
          ) {
            // The line was removed while this change was being saved.
          } else if (data) {
            const { error: updateError } = await supabase.from("grocery_items").update({ checked: entry.checked }).eq("id", data.id);
            if (updateError) outcome = isOfflineError(updateError) ? "offline" : "rejected";
          } else {
            const { error: insertError } = await supabase.from("grocery_items").insert({
              id: entry.localId,
              account_id: initial.accountId,
              item_id: entry.itemId,
              checked: entry.checked,
            });
            if (insertError) {
              if (isOfflineError(insertError)) outcome = "offline";
              else if (insertError.code === "23505") {
                const { error: updateError } = await supabase
                  .from("grocery_items")
                  .update({ checked: entry.checked })
                  .eq("account_id", initial.accountId)
                  .eq("item_id", entry.itemId);
                if (updateError) outcome = isOfflineError(updateError) ? "offline" : "rejected";
              } else outcome = "rejected";
            }
            const stillThere = readPendingGrocery(initial.accountId).some(
              (row) => row.itemId === entry.itemId && row.revision === entry.revision,
            );
            if (!insertError && !stillThere) {
              await supabase
                .from("grocery_items")
                .delete()
                .eq("account_id", initial.accountId)
                .eq("item_id", entry.itemId);
            }
          }
        } catch (error) {
          outcome = isOfflineError(error instanceof Error ? error : null) ? "offline" : "rejected";
        }
        if (outcome === "offline") {
          paused = true;
          break;
        }
        const cleared = forgetPendingGrocery(initial.accountId, entry.itemId, entry.revision);
        if (outcome === "rejected" && cleared) {
          paused = true;
          setError("לא ניתן לעדכן את רשימת הקניות");
          void refetch();
          break;
        }
      }
    } finally {
      syncingGrocery.current.running = false;
      const again = syncingGrocery.current.again;
      syncingGrocery.current.again = false;
      if (!paused && again && navigator.onLine) void syncPendingGrocery();
    }
  }, [initial.accountId, refetch]);

  useEffect(() => {
    setGrocery((current) => mergePendingGrocery(initial.accountId, current));
  }, [initial.accountId]);

  useEffect(() => {
    const sync = () => {
      void syncPendingGrocery().then(() => {
        if (readPendingGrocery(initial.accountId).length === 0) void refetch();
      });
    };
    window.addEventListener("online", sync);
    if (readPendingGrocery(initial.accountId).length > 0) sync();
    return () => window.removeEventListener("online", sync);
  }, [initial.accountId, refetch, syncPendingGrocery]);

  const value = useMemo<ListsContextValue>(() => {
    return {
      accountId: initial.accountId,
      username: initial.username,
      categories: sortByOrder(categories),
      stores: sortStores(stores),
      storesError,
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
        const byName = (a: { name: string }, b: { name: string }) => compareNames(a.name, b.name);
        const nextCategories = [...categories].sort(byName);
        const supabase = supabaseRef.current;
        const { error: categoryError } = await supabase.rpc("reorder_categories", {
          ids: nextCategories.map((category) => category.id),
        });
        if (categoryError) {
          setSaving(false);
          fail("לא ניתן למיין");
          return false;
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
          return false;
        }
        await refetch();
        return true;
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
      async addCategory(name, imageFile, storeId, separatorAfter = false, separatorText = "") {
        const trimmed = name.trim();
        if (!trimmed) {
          setError("יש להזין שם");
          return null;
        }
        setSaving(true);
        setError(null);
        reorderRef.current = true;
        const ordered = sortByOrder(categories);
        const index = nameInsertIndex(
          ordered.map((category) => category.name),
          trimmed,
        );
        const color = nextCategoryColor(categories.map((category) => category.color));
        const chosenStore = storeId || defaultStore(stores)?.id;
        const { data, error: insertError } = await supabaseRef.current
          .from("categories")
          .insert({
            account_id: initial.accountId,
            name: trimmed,
            color,
            sort_order: index,
            separator_after: separatorAfter,
            separator_text: separatorAfter ? separatorText.trim() : "",
            ...(chosenStore ? { store_id: chosenStore } : {}),
          })
          .select("*")
          .single();
        if (insertError || !data) {
          reorderRef.current = false;
          setSaving(false);
          fail("לא ניתן להוסיף קטגוריה");
          return null;
        }
        const category = normalizeCategory(data);
        const ids = ordered.map((row) => row.id);
        ids.splice(index, 0, category.id);
        setCategories((current) => applyOrder([...current, category], ids));
        const { error: orderError } = await supabaseRef.current.rpc("reorder_categories", { ids });
        reorderRef.current = false;
        if (orderError) fail("לא ניתן למיין");
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
        const chosenStore = input.storeId || undefined;
        const { error: updateError } = await supabaseRef.current
          .from("categories")
          .update({
            name,
            separator_after: input.separatorAfter === true,
            separator_text: input.separatorAfter === true ? (input.separatorText ?? "").trim() : "",
            ...(chosenStore ? { store_id: chosenStore } : {}),
          })
          .eq("id", input.id);
        if (updateError) {
          setSaving(false);
          fail("לא ניתן לשמור את הקטגוריה");
          return false;
        }
        setCategories((current) =>
          current.map((category) =>
            category.id === input.id
              ? {
                  ...category,
                  name,
                  store_id: chosenStore ?? category.store_id,
                  separator_after: input.separatorAfter === true,
                  separator_text: input.separatorAfter === true ? (input.separatorText ?? "").trim() : "",
                }
              : category,
          ),
        );
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
      async deleteItem(id) {
        setError(null);
        const item = items.find((entry) => entry.id === id);
        const folder = `${initial.accountId}/items/${id}`;
        const paths = new Set<string>();
        if (item?.image_path) paths.add(item.image_path);
        const { data: listed } = await supabaseRef.current.storage.from("item-images").list(folder);
        for (const entry of listed ?? []) {
          if (!entry.name || entry.metadata == null) continue;
          paths.add(`${folder}/${entry.name}`);
        }
        const { error: deleteError } = await supabaseRef.current.from("items").delete().eq("id", id);
        if (deleteError) {
          fail("לא ניתן למחוק את המוצר");
          return;
        }
        const imagePaths = [...paths];
        if (imagePaths.length > 0) {
          const { error: removeError } = await supabaseRef.current.storage.from("item-images").remove(imagePaths);
          await Promise.all(imagePaths.map((path) => forgetCachedImage(path)));
          setImageSrcs((current) => {
            let changed = false;
            const next = { ...current };
            for (const path of imagePaths) {
              const url = next[path];
              if (!url) continue;
              URL.revokeObjectURL(url);
              delete next[path];
              changed = true;
            }
            return changed ? next : current;
          });
          if (removeError) setError("המוצר נמחק, אבל התמונה לא");
        }
        const pending = readPendingGrocery(initial.accountId).find((entry) => entry.itemId === id);
        if (pending) forgetPendingGrocery(initial.accountId, id, pending.revision);
        setPreviews((current) => {
          const key = `item:${id}`;
          const url = current[key];
          if (!url) return current;
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          const next = { ...current };
          delete next[key];
          return next;
        });
        setItems((current) => current.filter((entry) => entry.id !== id));
        setGrocery((current) => current.filter((line) => line.item_id !== id));
      },
      async saveStore(input) {
        const current = stores.find((store) => store.id === input.id);
        if (!current) return "לא ניתן לשמור את החנות";
        const name = (input.name ?? current.name).trim();
        const color = colorHex(input.color ?? current.color);
        if (!name) return "יש להזין שם";
        const duplicate = stores.some(
          (store) => store.id !== input.id && store.name.toLocaleLowerCase("he") === name.toLocaleLowerCase("he"),
        );
        if (duplicate) return "שם החנות כבר קיים";
        const { error: updateError } = await supabaseRef.current.from("stores").update({ name, color }).eq("id", input.id);
        if (updateError) return "לא ניתן לשמור את החנות";
        setStores((rows) => sortStores(rows.map((store) => (store.id === input.id ? { ...store, name, color } : store))));
        return null;
      },
      async addStore(name, color) {
        const trimmed = name.trim();
        if (!trimmed) return "יש להזין שם";
        if (stores.some((store) => store.name.toLocaleLowerCase("he") === trimmed.toLocaleLowerCase("he"))) return "שם החנות כבר קיים";
        const sortOrder = stores.reduce((max, store) => Math.max(max, store.sort_order), -1) + 1;
        const { data, error: insertError } = await supabaseRef.current
          .from("stores")
          .insert({
            account_id: initial.accountId,
            name: trimmed,
            color: colorHex(color),
            sort_order: sortOrder,
            protected: false,
          })
          .select("*")
          .single();
        if (insertError || !data) return "לא ניתן להוסיף חנות";
        setStores((rows) => sortStores([...rows, normalizeStore(data)]));
        return null;
      },
      async deleteStore(id) {
        const current = stores.find((store) => store.id === id);
        if (!current) return "לא ניתן למחוק את החנות";
        if (current.protected) return "לא ניתן למחוק את החנות הראשית";
        const fallback = stores.find((store) => store.protected);
        if (!fallback) return "לא ניתן למחוק את החנות";
        const { error: moveError } = await supabaseRef.current
          .from("categories")
          .update({ store_id: fallback.id })
          .eq("account_id", initial.accountId)
          .eq("store_id", id);
        if (moveError) return "לא ניתן למחוק את החנות";
        const { error: deleteError } = await supabaseRef.current.from("stores").delete().eq("id", id);
        if (deleteError) return "לא ניתן למחוק את החנות";
        setStores((rows) => rows.filter((store) => store.id !== id));
        setCategories((rows) => rows.map((category) => (category.store_id === id ? { ...category, store_id: fallback.id } : category)));
        return null;
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
        reorderRef.current = true;
        const siblings = sortByOrder(items.filter((item) => item.category_id === input.categoryId));
        const index = nameInsertIndex(
          siblings.map((item) => item.name),
          name,
        );
        const { data, error: insertError } = await supabase
          .from("items")
          .insert({
            account_id: initial.accountId,
            category_id: input.categoryId,
            name,
            unit: input.unit,
            comments: input.comments.trim(),
            quantity,
            sort_order: index,
          })
          .select("*")
          .single();
        if (insertError || !data) {
          reorderRef.current = false;
          setSaving(false);
          fail("לא ניתן להוסיף מוצר");
          return false;
        }
        const item = normalizeItem(data);
        const ids = siblings.map((row) => row.id);
        ids.splice(index, 0, item.id);
        setItems((current) => {
          const others = current.filter((row) => row.category_id !== input.categoryId);
          return [...others, ...applyOrder([...siblings, item], ids)];
        });
        const { error: orderError } = await supabase.rpc("reorder_items", { target_category: input.categoryId, ids });
        reorderRef.current = false;
        if (orderError) fail("לא ניתן למיין");
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
        const localId = existing?.id ?? crypto.randomUUID();
        if (!existing) {
          const optimistic: GroceryLine = {
            id: localId,
            account_id: initial.accountId,
            item_id: itemId,
            checked: false,
          };
          setGrocery((current) => [...current, optimistic]);
        } else if (existing.checked) {
          setGrocery((current) => current.map((line) => (line.item_id === itemId ? { ...line, checked: false } : line)));
        } else return;
        rememberPendingGrocery(initial.accountId, itemId, false, localId);
        await syncPendingGrocery();
        if (!readPendingGrocery(initial.accountId).some((entry) => entry.itemId === itemId)) void refetch();
      },
      async setChecked(itemId, checked) {
        const existing = grocery.find((line) => line.item_id === itemId);
        if (!existing || existing.checked === checked) return;
        rememberPendingGrocery(initial.accountId, itemId, checked, existing.id);
        flushSync(() => {
          setGrocery((current) => current.map((line) => (line.item_id === itemId ? { ...line, checked } : line)));
        });
        void syncPendingGrocery().then(() => {
          if (!readPendingGrocery(initial.accountId).some((entry) => entry.itemId === itemId)) void refetch();
        });
      },
      async removeFromGrocery(itemId) {
        const existing = grocery.find((line) => line.item_id === itemId);
        if (!existing) return;
        setGrocery((current) => current.filter((line) => line.item_id !== itemId));
        const pending = readPendingGrocery(initial.accountId).find((entry) => entry.itemId === itemId);
        if (pending) forgetPendingGrocery(initial.accountId, itemId, pending.revision);
        const { error: deleteError } = await supabaseRef.current
          .from("grocery_items")
          .delete()
          .eq("account_id", initial.accountId)
          .eq("item_id", itemId);
        if (deleteError) fail("לא ניתן להסיר מהרשימה");
      },
      async clearPurchased() {
        const ids = grocery.filter((line) => line.checked).map((line) => line.id);
        if (ids.length === 0) return;
        setGrocery((current) => current.filter((line) => !line.checked));
        const { error: deleteError } = await supabaseRef.current.from("grocery_items").delete().in("id", ids);
        if (deleteError) fail("לא ניתן לנקות את הפריטים שנקנו");
      },
      async importInventory(file: File, options?: { recipes?: "replace" | "append" }, onProgress?: (ratio: number) => void) {
        importingRef.current = true;
        reorderRef.current = false;
        setReorderMode(false);
        setSaving(true);
        setError(null);
        try {
          const imported = await replaceInventory(supabaseRef.current, initial.accountId, file, onProgress, options);
          if (imported.categories && imported.items) {
            setCategories(imported.categories);
            setItems(imported.items);
            setPreviews({});
          }
          if (imported.grocery !== null) {
            clearPendingGrocery(initial.accountId);
            setGrocery(imported.grocery);
          }
          if (imported.checklist) {
            pendingIds.current.clear();
            pendingDeletes.current.clear();
            dirtyBody.current.clear();
            checklistRef.current = imported.checklist;
            setChecklist(imported.checklist);
            setChecklistError(null);
          }
          if (imported.recipes) window.dispatchEvent(new Event(recipesImportedEvent));
        } catch (error) {
          setError(error instanceof Error && error.message ? error.message : "לא ניתן לייבא את הרשימה");
        } finally {
          importingRef.current = false;
          setSaving(false);
          void refetch();
        }
      },
      async clearGrocery() {
        if (grocery.length === 0) return;
        setGrocery([]);
        const { error: deleteError } = await supabaseRef.current.from("grocery_items").delete().eq("account_id", initial.accountId);
        if (deleteError) {
          fail("לא ניתן לרוקן את רשימת הקניות");
          void refetch();
        }
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
      checklist: sortChecklist(checklist),
      checklistError,
      addChecklistRow,
      setChecklistBody,
      setChecklistIndent,
      moveChecklist,
      setChecklistChecked,
      deleteChecklistRow,
    };
  }, [
    addChecklistRow,
    categories,
    stores,
    storesError,
    checklist,
    checklistError,
    deleteChecklistRow,
    error,
    grocery,
    imageSrc,
    initial.accountId,
    initial.username,
    items,
    refetch,
    reorderMode,
    syncPendingGrocery,
    saving,
    setChecklistBody,
    setChecklistChecked,
    moveChecklist,
    setChecklistIndent,
  ]);

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
