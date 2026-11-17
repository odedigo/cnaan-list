"use client";

/** Shared client state for inventory, grocery, stores, checklists, packing lists, and events, including Supabase sync. */

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

import type { AccountSection } from "@/lib/account-sections";
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
import { eventDraftError, eventRecord, normalizeEvent, sortEvents, type EventDraft } from "@/lib/events";
import { normalizePackingCategory, normalizePackingItem, normalizePackingList, packingCopyName, packingName, reorderRows } from "@/lib/packing";
import { clearPendingGrocery, forgetPendingGrocery, isOfflineError, mergePendingGrocery, readPendingGrocery, rememberPendingGrocery } from "@/lib/grocery-sync";
import { recipesImportedEvent } from "@/lib/recipe-transfer";
import { forgetCachedImage, pruneImageCache, readCachedImage, writeCachedImage } from "@/lib/image-cache";
import { replaceInventory } from "@/lib/import-inventory";
import { loadLists } from "@/lib/lists";
import { compressImage } from "@/lib/images";
import { applyOrder, compareNames, moveVisible, nameInsertIndex, sortByOrder } from "@/lib/order";
import { defaultStore, normalizeStore, sortStores } from "@/lib/stores";
import { createClient } from "@/lib/supabase/client";
import type { AccountEvent, Category, ChecklistRow, GroceryLine, Item, ListsData, PackingCategory, PackingItem, PackingList, Store } from "@/lib/types";
import { isUnitId, parseQuantity, type UnitId } from "@/lib/units";

type ListsContextValue = {
  accountId: string;
  username: string;
  sections: AccountSection[];
  categories: Category[];
  stores: Store[];
  storesError: string | null;
  items: Item[];
  grocery: GroceryLine[];
  reorderMode: boolean;
  saving: boolean;
  error: string | null;
  imageSrc: (kind: "item" | "category" | "event", id: string, path: string | null) => string | null;
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
  importInventory: (file: File, options?: { recipes?: "replace" | "append"; only?: "packing" | "packing-list" }, onProgress?: (ratio: number) => void) => Promise<void>;
  checklist: ChecklistRow[];
  checklistError: string | null;
  addChecklistRow: (where: { at: "start" } | { afterId: string }) => string | null;
  setChecklistBody: (id: string, body: string) => Promise<void>;
  setChecklistIndent: (id: string, direction: "increase" | "decrease") => Promise<void>;
  moveChecklist: (activeId: string, overId: string) => Promise<void>;
  setChecklistChecked: (id: string, checked: boolean) => Promise<void>;
  setChecklistPriority: (id: string, priority: ChecklistRow["priority"]) => Promise<void>;
  deleteChecklistRow: (id: string) => Promise<void>;
  packingLists: PackingList[];
  packingCategories: PackingCategory[];
  packingItems: PackingItem[];
  packingReady: boolean;
  addPackingList: (name: string) => Promise<string | null>;
  duplicatePackingList: (id: string) => Promise<string | null>;
  renamePackingList: (id: string, name: string) => Promise<boolean>;
  setPackingFavorite: (id: string, favorite: boolean) => Promise<void>;
  deletePackingList: (id: string) => Promise<void>;
  movePackingList: (activeId: string, overId: string) => Promise<void>;
  setPackingListChecked: (listId: string, checked: boolean) => Promise<void>;
  addPackingCategory: (listId: string, name: string) => Promise<string | null>;
  renamePackingCategory: (id: string, name: string) => Promise<boolean>;
  deletePackingCategory: (id: string) => Promise<void>;
  movePackingCategory: (listId: string, activeId: string, overId: string) => Promise<void>;
  movePackingItem: (categoryId: string, activeId: string, overId: string) => Promise<void>;
  sortPackingItems: (listId: string) => Promise<void>;
  addPackingItem: (categoryId: string, name: string) => Promise<string | null>;
  renamePackingItem: (id: string, name: string) => Promise<boolean>;
  deletePackingItem: (id: string) => Promise<void>;
  setPackingItemChecked: (id: string, checked: boolean) => Promise<void>;
  setPackingItemQuantity: (id: string, quantity: number) => Promise<void>;
  events: AccountEvent[];
  eventsReady: boolean;
  saveEvent: (draft: EventDraft & { id?: string; imageFile: File | null; removeImage: boolean }) => Promise<boolean>;
  deleteEvent: (id: string) => Promise<void>;
  uploadImage: (kind: "item" | "category", id: string, file: File) => Promise<void>;
  removeImage: (kind: "item" | "category", id: string) => Promise<void>;
};

const ListsContext = createContext<ListsContextValue | null>(null);
const BootContext = createContext<string | null>(null);

export function useBootError() {
  return useContext(BootContext);
}

export function ListsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ListsData | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const accountId = data?.accountId ?? "";
  const username = data?.username ?? "";
  const sections = data?.sections ?? [];
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storesReady, setStoresReady] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [grocery, setGrocery] = useState<GroceryLine[]>([]);
  const groceryRef = useRef<GroceryLine[]>([]);
  const groceryGen = useRef(0);
  groceryRef.current = grocery;
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [packingLists, setPackingLists] = useState<PackingList[]>([]);
  const [packingCategories, setPackingCategories] = useState<PackingCategory[]>([]);
  const [packingItems, setPackingItems] = useState<PackingItem[]>([]);
  const [packingReady, setPackingReady] = useState(false);
  const [events, setEvents] = useState<AccountEvent[]>([]);
  const [eventsReady, setEventsReady] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageSrcs, setImageSrcs] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const reorderRef = useRef(false);
  const importingRef = useRef(false);
  const supabaseRef = useRef(createClient());
  const checklistRef = useRef<ChecklistRow[]>([]);
  const packingListsRef = useRef<PackingList[]>([]);
  const packingCategoriesRef = useRef<PackingCategory[]>([]);
  const packingItemsRef = useRef<PackingItem[]>([]);
  const packingGen = useRef(0);
  const packingWrites = useRef(0);
  const eventsRef = useRef<AccountEvent[]>([]);
  const eventsGen = useRef(0);
  const eventsWrites = useRef(0);
  const writeChain = useRef(Promise.resolve());
  const pendingIds = useRef(new Set<string>());
  const pendingDeletes = useRef(new Set<string>());
  const dirtyBody = useRef(new Map<string, string>());
  checklistRef.current = checklist;

  useEffect(() => {
    let cancel = false;
    const supabase = createClient();
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      let userId = sessionData.session?.user.id;
      if (!userId) {
        const { data: userData } = await supabase.auth.getUser();
        userId = userData.user?.id;
      }
      if (cancel) return;
      if (!userId) {
        window.location.replace("/settings");
        return;
      }
      const loaded = await loadLists(supabase, userId);
      if (cancel) return;
      if (!loaded) {
        setBootError("לא ניתן לטעון את הרשימות.");
        return;
      }
      groceryRef.current = loaded.grocery;
      checklistRef.current = loaded.checklist;
      packingListsRef.current = loaded.packingLists;
      packingCategoriesRef.current = loaded.packingCategories;
      packingItemsRef.current = loaded.packingItems;
      eventsRef.current = loaded.events;
      setCategories(loaded.categories);
      setStores(loaded.stores);
      setStoresReady(loaded.storesReady);
      setStoresError(loaded.storesReady ? null : "לא ניתן לטעון את החנויות");
      setItems(loaded.items);
      setGrocery(loaded.grocery);
      setChecklist(loaded.checklist);
      setPackingLists(loaded.packingLists);
      setPackingCategories(loaded.packingCategories);
      setPackingItems(loaded.packingItems);
      setPackingReady(loaded.packingReady);
      setEvents(loaded.events);
      setEventsReady(loaded.eventsReady);
      setData(loaded);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const refetch = useCallback(async () => {
    if (!accountId || reorderRef.current || importingRef.current) return;
    const seenGroceryGen = groceryGen.current;
    const seenPackingGen = packingGen.current;
    const seenEventsGen = eventsGen.current;
    const supabase = supabaseRef.current;
    const [{ data: categoryRows }, { data: itemRows }, { data: groceryRows }, checklistResult, storesResult, packingListsResult, packingCategoriesResult, packingItemsResult, eventsResult] = await Promise.all([
      supabase.from("categories").select("*").eq("account_id", accountId).order("sort_order"),
      supabase.from("items").select("*").eq("account_id", accountId).order("sort_order"),
      supabase.from("grocery_items").select("*").eq("account_id", accountId),
      supabase.from("checklist_rows").select("*").eq("account_id", accountId).order("sort_order"),
      supabase.from("stores").select("*").eq("account_id", accountId).order("sort_order"),
      supabase.from("packing_lists").select("*").eq("account_id", accountId).order("sort_order"),
      supabase.from("packing_categories").select("*").eq("account_id", accountId).order("sort_order"),
      supabase.from("packing_items").select("*").eq("account_id", accountId).order("sort_order"),
      supabase.from("events").select("*").eq("account_id", accountId),
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
    if (groceryRows && seenGroceryGen === groceryGen.current) setGrocery(mergePendingGrocery(accountId, groceryRows as GroceryLine[]));
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
    const packingFailed = Boolean(packingListsResult.error || packingCategoriesResult.error || packingItemsResult.error);
    if (packingFailed) setPackingReady(false);
    else if (packingWrites.current === 0 && seenPackingGen === packingGen.current) {
      const nextLists = (packingListsResult.data ?? []).map(normalizePackingList);
      const nextCategories = (packingCategoriesResult.data ?? []).map(normalizePackingCategory);
      const nextItems = (packingItemsResult.data ?? []).map(normalizePackingItem);
      packingListsRef.current = nextLists;
      packingCategoriesRef.current = nextCategories;
      packingItemsRef.current = nextItems;
      setPackingLists(nextLists);
      setPackingCategories(nextCategories);
      setPackingItems(nextItems);
      setPackingReady(true);
    }
    if (eventsResult.error) setEventsReady(false);
    else if (eventsWrites.current === 0 && seenEventsGen === eventsGen.current) {
      const nextEvents = (eventsResult.data ?? []).map(normalizeEvent);
      eventsRef.current = nextEvents;
      setEvents(nextEvents);
      setEventsReady(true);
    }
  }, [accountId]);

  useEffect(() => {
    if (!data) return;
    const ordered = [...data.categories].sort((a, b) => a.sort_order - b.sort_order);
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
  }, [data]);

  useEffect(() => {
    if (!accountId) return;
    const supabase = supabaseRef.current;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void refetch();
      }, 40);
    };
    let channel = supabase
      .channel(`account-${accountId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter: `account_id=eq.${accountId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `account_id=eq.${accountId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "grocery_items", filter: `account_id=eq.${accountId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_rows", filter: `account_id=eq.${accountId}` }, schedule);
    if (storesReady) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "stores", filter: `account_id=eq.${accountId}` }, schedule);
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") schedule();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    const packingChannel = supabase
      .channel(`account-${accountId}-packing`)
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_lists", filter: `account_id=eq.${accountId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_categories", filter: `account_id=eq.${accountId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_items", filter: `account_id=eq.${accountId}` }, schedule)
      .subscribe();
    const eventsChannel = supabase
      .channel(`account-${accountId}-events`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `account_id=eq.${accountId}` }, schedule)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
      void supabase.removeChannel(packingChannel);
      void supabase.removeChannel(eventsChannel);
    };
  }, [accountId, refetch, storesReady]);

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
    for (const event of events) add(event.image_path, later);
    return { urgent, later, key: [...seen].sort().join("|") };
  }, [categories, events, grocery, items]);
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
    (kind: "item" | "category" | "event", id: string, path: string | null) => {
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
        return old.body !== row.body || old.indent !== row.indent || old.checked !== row.checked || old.sort_order !== row.sort_order || old.priority !== row.priority;
      });
      for (const row of inserts) pendingIds.current.add(row.id);
      for (const row of deletes) pendingDeletes.current.add(row.id);
      const results = await Promise.all([
        ...inserts.map((row) =>
          supabase.from("checklist_rows").insert({
            id: row.id,
            account_id: accountId,
            body: row.body,
            indent: row.indent,
            checked: row.checked,
            sort_order: row.sort_order,
            priority: row.priority,
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
              priority: row.priority,
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
    [accountId, refetch],
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
        account_id: accountId,
        body: "",
        indent: source?.indent ?? 0,
        checked: false,
        sort_order: index,
        priority: null,
      };
      void commitChecklist(previous, insertChecklistRow(previous, row, index));
      return row.id;
    },
    [commitChecklist, accountId],
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

  const setChecklistPriority = useCallback(
    (id: string, priority: ChecklistRow["priority"]) => {
      const previous = sortChecklist(checklistRef.current);
      const current = previous.find((row) => row.id === id);
      if (!current || current.priority === priority) return Promise.resolve();
      const next = previous.map((row) => (row.id === id ? { ...row, priority } : row));
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

  const rememberPacking = useCallback((next: { lists?: PackingList[]; categories?: PackingCategory[]; items?: PackingItem[] }) => {
    packingGen.current += 1;
    if (next.lists) packingListsRef.current = next.lists;
    if (next.categories) packingCategoriesRef.current = next.categories;
    if (next.items) packingItemsRef.current = next.items;
    flushSync(() => {
      if (next.lists) setPackingLists(next.lists);
      if (next.categories) setPackingCategories(next.categories);
      if (next.items) setPackingItems(next.items);
    });
  }, []);

  const settlePacking = useCallback(
    async (failed: boolean, message: string) => {
      packingWrites.current = Math.max(0, packingWrites.current - 1);
      if (packingWrites.current > 0) {
        if (failed) setError(message);
        return;
      }
      packingGen.current += 1;
      if (failed) setError(message);
      else setError(null);
      await refetch();
    },
    [refetch],
  );

  const runPacking = useCallback(
    async (message: string, task: () => Promise<boolean>) => {
      packingWrites.current += 1;
      let failed = true;
      try {
        failed = await task();
      } catch {
        failed = true;
      }
      await settlePacking(failed, message);
      return !failed;
    },
    [settlePacking],
  );

  const addPackingList = useCallback(
    async (name: string) => {
      const trimmed = packingName(name);
      if (!trimmed) {
        setError(name.trim() ? "השם ארוך מדי" : "יש להזין שם");
        return null;
      }
      const ordered = sortByOrder(packingListsRef.current);
      const row: PackingList = {
        id: crypto.randomUUID(),
        account_id: accountId,
        name: trimmed,
        favorite: false,
        sort_order: ordered.length === 0 ? 0 : ordered[ordered.length - 1].sort_order + 1,
      };
      rememberPacking({ lists: [...ordered, row] });
      const saved = await runPacking("לא ניתן להוסיף רשימה", async () => {
        const { error: insertError } = await supabaseRef.current.from("packing_lists").insert({
          id: row.id,
          account_id: accountId,
          name: row.name,
          favorite: false,
          sort_order: row.sort_order,
        });
        return Boolean(insertError);
      });
      return saved ? row.id : null;
    },
    [accountId, rememberPacking, runPacking],
  );

  const duplicatePackingList = useCallback(
    async (id: string) => {
      const source = packingListsRef.current.find((row) => row.id === id);
      if (!source) return null;
      const name = packingName(packingCopyName(source.name));
      if (!name) {
        setError("השם ארוך מדי");
        return null;
      }
      const ordered = sortByOrder(packingListsRef.current);
      const list: PackingList = {
        id: crypto.randomUUID(),
        account_id: accountId,
        name,
        favorite: false,
        sort_order: ordered.length === 0 ? 0 : ordered[ordered.length - 1].sort_order + 1,
      };
      const categoryIds = new Map<string, string>();
      const categories = sortByOrder(packingCategoriesRef.current.filter((row) => row.list_id === id)).map((row) => {
        const nextId = crypto.randomUUID();
        categoryIds.set(row.id, nextId);
        return { ...row, id: nextId, list_id: list.id };
      });
      const items = packingItemsRef.current.flatMap((row) => {
        const categoryId = categoryIds.get(row.category_id);
        if (!categoryId) return [];
        return [{ ...row, id: crypto.randomUUID(), category_id: categoryId }];
      });
      rememberPacking({
        lists: [...ordered, list],
        categories: [...packingCategoriesRef.current, ...categories],
        items: [...packingItemsRef.current, ...items],
      });
      const saved = await runPacking("לא ניתן לשכפל את הרשימה", async () => {
        const { error: listError } = await supabaseRef.current.from("packing_lists").insert({
          id: list.id,
          account_id: accountId,
          name: list.name,
          favorite: false,
          sort_order: list.sort_order,
        });
        if (listError) return true;
        if (categories.length > 0) {
          const { error } = await supabaseRef.current.from("packing_categories").insert(
            categories.map((row) => ({
              id: row.id,
              account_id: accountId,
              list_id: row.list_id,
              name: row.name,
              color: row.color,
              sort_order: row.sort_order,
            })),
          );
          if (error) {
            await supabaseRef.current.from("packing_lists").delete().eq("id", list.id);
            return true;
          }
        }
        if (items.length > 0) {
          const { error } = await supabaseRef.current.from("packing_items").insert(
            items.map((row) => ({
              id: row.id,
              account_id: accountId,
              category_id: row.category_id,
              name: row.name,
              quantity: row.quantity,
              checked: row.checked,
              sort_order: row.sort_order,
            })),
          );
          if (error) {
            await supabaseRef.current.from("packing_lists").delete().eq("id", list.id);
            return true;
          }
        }
        return false;
      });
      return saved ? list.id : null;
    },
    [accountId, rememberPacking, runPacking],
  );

  const renamePackingList = useCallback(
    async (id: string, name: string) => {
      const trimmed = packingName(name);
      if (!trimmed) {
        setError(name.trim() ? "השם ארוך מדי" : "יש להזין שם");
        return false;
      }
      const current = packingListsRef.current.find((row) => row.id === id);
      if (!current || current.name === trimmed) return Boolean(current);
      rememberPacking({ lists: packingListsRef.current.map((row) => (row.id === id ? { ...row, name: trimmed } : row)) });
      return runPacking("לא ניתן לשמור את הרשימה", async () => {
        const { error: updateError } = await supabaseRef.current.from("packing_lists").update({ name: trimmed }).eq("id", id);
        return Boolean(updateError);
      });
    },
    [rememberPacking, runPacking],
  );

  const setPackingFavorite = useCallback(
    async (id: string, favorite: boolean) => {
      const current = packingListsRef.current.find((row) => row.id === id);
      if (!current || current.favorite === favorite) return;
      rememberPacking({ lists: packingListsRef.current.map((row) => (row.id === id ? { ...row, favorite } : row)) });
      await runPacking("לא ניתן לשמור את הרשימה", async () => {
        const { error: updateError } = await supabaseRef.current.from("packing_lists").update({ favorite }).eq("id", id);
        return Boolean(updateError);
      });
    },
    [rememberPacking, runPacking],
  );

  const deletePackingList = useCallback(
    async (id: string) => {
      if (!packingListsRef.current.some((row) => row.id === id)) return;
      const categoryIds = new Set(packingCategoriesRef.current.filter((row) => row.list_id === id).map((row) => row.id));
      rememberPacking({
        lists: packingListsRef.current.filter((row) => row.id !== id),
        categories: packingCategoriesRef.current.filter((row) => row.list_id !== id),
        items: packingItemsRef.current.filter((row) => !categoryIds.has(row.category_id)),
      });
      await runPacking("לא ניתן למחוק את הרשימה", async () => {
        const { error: deleteError } = await supabaseRef.current.from("packing_lists").delete().eq("id", id);
        return Boolean(deleteError);
      });
    },
    [rememberPacking, runPacking],
  );

  const movePackingList = useCallback(
    async (activeId: string, overId: string) => {
      const next = reorderRows(packingListsRef.current, activeId, overId);
      if (!next) return;
      rememberPacking({ lists: next });
      await runPacking("לא ניתן לשמור את הסדר", async () => {
        const results = await Promise.all(next.map((row) => supabaseRef.current.from("packing_lists").update({ sort_order: row.sort_order }).eq("id", row.id)));
        return results.some((result) => result.error);
      });
    },
    [rememberPacking, runPacking],
  );

  const setPackingListChecked = useCallback(
    async (listId: string, checked: boolean) => {
      const categoryIds = packingCategoriesRef.current.filter((row) => row.list_id === listId).map((row) => row.id);
      if (categoryIds.length === 0) return;
      const ids = new Set(categoryIds);
      rememberPacking({
        items: packingItemsRef.current.map((row) => (ids.has(row.category_id) ? { ...row, checked } : row)),
      });
      await runPacking("לא ניתן לשמור את הסימונים", async () => {
        const { error: updateError } = await supabaseRef.current.from("packing_items").update({ checked }).in("category_id", categoryIds);
        return Boolean(updateError);
      });
    },
    [rememberPacking, runPacking],
  );

  const addPackingCategory = useCallback(
    async (listId: string, name: string) => {
      const trimmed = packingName(name);
      if (!trimmed) {
        setError(name.trim() ? "השם ארוך מדי" : "יש להזין שם");
        return null;
      }
      const siblings = sortByOrder(packingCategoriesRef.current.filter((row) => row.list_id === listId));
      const row: PackingCategory = {
        id: crypto.randomUUID(),
        account_id: accountId,
        list_id: listId,
        name: trimmed,
        color: nextCategoryColor(siblings.map((category) => category.color)),
        sort_order: siblings.length === 0 ? 0 : siblings[siblings.length - 1].sort_order + 1,
      };
      rememberPacking({ categories: [...packingCategoriesRef.current, row] });
      const saved = await runPacking("לא ניתן להוסיף קטגוריה", async () => {
        const { error: insertError } = await supabaseRef.current.from("packing_categories").insert({
          id: row.id,
          account_id: accountId,
          list_id: listId,
          name: row.name,
          color: row.color,
          sort_order: row.sort_order,
        });
        return Boolean(insertError);
      });
      return saved ? row.id : null;
    },
    [accountId, rememberPacking, runPacking],
  );

  const renamePackingCategory = useCallback(
    async (id: string, name: string) => {
      const trimmed = packingName(name);
      if (!trimmed) {
        setError(name.trim() ? "השם ארוך מדי" : "יש להזין שם");
        return false;
      }
      const current = packingCategoriesRef.current.find((row) => row.id === id);
      if (!current || current.name === trimmed) return Boolean(current);
      rememberPacking({ categories: packingCategoriesRef.current.map((row) => (row.id === id ? { ...row, name: trimmed } : row)) });
      return runPacking("לא ניתן לשמור את הקטגוריה", async () => {
        const { error: updateError } = await supabaseRef.current.from("packing_categories").update({ name: trimmed }).eq("id", id);
        return Boolean(updateError);
      });
    },
    [rememberPacking, runPacking],
  );

  const deletePackingCategory = useCallback(
    async (id: string) => {
      if (!packingCategoriesRef.current.some((row) => row.id === id)) return;
      rememberPacking({
        categories: packingCategoriesRef.current.filter((row) => row.id !== id),
        items: packingItemsRef.current.filter((row) => row.category_id !== id),
      });
      await runPacking("לא ניתן למחוק את הקטגוריה", async () => {
        const { error: deleteError } = await supabaseRef.current.from("packing_categories").delete().eq("id", id);
        return Boolean(deleteError);
      });
    },
    [rememberPacking, runPacking],
  );

  const movePackingCategory = useCallback(
    async (listId: string, activeId: string, overId: string) => {
      const siblings = packingCategoriesRef.current.filter((row) => row.list_id === listId);
      const nextSiblings = reorderRows(siblings, activeId, overId);
      if (!nextSiblings) return;
      const rank = new Map(nextSiblings.map((row) => [row.id, row.sort_order]));
      rememberPacking({
        categories: packingCategoriesRef.current.map((row) => (rank.has(row.id) ? { ...row, sort_order: rank.get(row.id) ?? row.sort_order } : row)),
      });
      await runPacking("לא ניתן לשמור את הסדר", async () => {
        const results = await Promise.all(nextSiblings.map((row) => supabaseRef.current.from("packing_categories").update({ sort_order: row.sort_order }).eq("id", row.id)));
        return results.some((result) => result.error);
      });
    },
    [rememberPacking, runPacking],
  );

  const movePackingItem = useCallback(
    async (categoryId: string, activeId: string, overId: string) => {
      const siblings = packingItemsRef.current.filter((row) => row.category_id === categoryId);
      const nextSiblings = reorderRows(siblings, activeId, overId);
      if (!nextSiblings) return;
      const rank = new Map(nextSiblings.map((row) => [row.id, row.sort_order]));
      rememberPacking({
        items: packingItemsRef.current.map((row) => (rank.has(row.id) ? { ...row, sort_order: rank.get(row.id) ?? row.sort_order } : row)),
      });
      await runPacking("לא ניתן לשמור את הסדר", async () => {
        const results = await Promise.all(nextSiblings.map((row) => supabaseRef.current.from("packing_items").update({ sort_order: row.sort_order }).eq("id", row.id)));
        return results.some((result) => result.error);
      });
    },
    [rememberPacking, runPacking],
  );

  const sortPackingItems = useCallback(
    async (listId: string) => {
      const categoryIds = new Set(packingCategoriesRef.current.filter((row) => row.list_id === listId).map((row) => row.id));
      const rank = new Map<string, number>();
      for (const categoryId of categoryIds) {
        const group = sortByOrder(packingItemsRef.current.filter((row) => row.category_id === categoryId)).sort((a, b) => compareNames(a.name, b.name) || a.sort_order - b.sort_order);
        group.forEach((item, index) => rank.set(item.id, index));
      }
      const changed = [...rank].filter(([id, order]) => packingItemsRef.current.some((row) => row.id === id && row.sort_order !== order));
      if (changed.length === 0) return;
      rememberPacking({
        items: packingItemsRef.current.map((row) => (rank.has(row.id) ? { ...row, sort_order: rank.get(row.id) ?? row.sort_order } : row)),
      });
      await runPacking("לא ניתן למיין", async () => {
        const results = await Promise.all(changed.map(([id, sort_order]) => supabaseRef.current.from("packing_items").update({ sort_order }).eq("id", id)));
        return results.some((result) => result.error);
      });
    },
    [rememberPacking, runPacking],
  );

  const addPackingItem = useCallback(
    async (categoryId: string, name: string) => {
      const trimmed = packingName(name);
      if (!trimmed) {
        setError(name.trim() ? "השם ארוך מדי" : "יש להזין שם");
        return null;
      }
      const siblings = sortByOrder(packingItemsRef.current.filter((row) => row.category_id === categoryId));
      const row: PackingItem = {
        id: crypto.randomUUID(),
        account_id: accountId,
        category_id: categoryId,
        name: trimmed,
        quantity: 1,
        checked: false,
        sort_order: siblings.length === 0 ? 0 : siblings[siblings.length - 1].sort_order + 1,
      };
      rememberPacking({ items: [...packingItemsRef.current, row] });
      const saved = await runPacking("לא ניתן להוסיף פריט", async () => {
        const { error: insertError } = await supabaseRef.current.from("packing_items").insert({
          id: row.id,
          account_id: accountId,
          category_id: categoryId,
          name: row.name,
          quantity: row.quantity,
          checked: false,
          sort_order: row.sort_order,
        });
        return Boolean(insertError);
      });
      return saved ? row.id : null;
    },
    [accountId, rememberPacking, runPacking],
  );

  const renamePackingItem = useCallback(
    async (id: string, name: string) => {
      const trimmed = packingName(name);
      if (!trimmed) {
        setError(name.trim() ? "השם ארוך מדי" : "יש להזין שם");
        return false;
      }
      const current = packingItemsRef.current.find((row) => row.id === id);
      if (!current || current.name === trimmed) return Boolean(current);
      rememberPacking({ items: packingItemsRef.current.map((row) => (row.id === id ? { ...row, name: trimmed } : row)) });
      return runPacking("לא ניתן לשמור את הפריט", async () => {
        const { error: updateError } = await supabaseRef.current.from("packing_items").update({ name: trimmed }).eq("id", id);
        return Boolean(updateError);
      });
    },
    [rememberPacking, runPacking],
  );

  const deletePackingItem = useCallback(
    async (id: string) => {
      if (!packingItemsRef.current.some((row) => row.id === id)) return;
      rememberPacking({ items: packingItemsRef.current.filter((row) => row.id !== id) });
      await runPacking("לא ניתן למחוק את הפריט", async () => {
        const { error: deleteError } = await supabaseRef.current.from("packing_items").delete().eq("id", id);
        return Boolean(deleteError);
      });
    },
    [rememberPacking, runPacking],
  );

  const setPackingItemChecked = useCallback(
    async (id: string, checked: boolean) => {
      const current = packingItemsRef.current.find((row) => row.id === id);
      if (!current || current.checked === checked) return;
      rememberPacking({ items: packingItemsRef.current.map((row) => (row.id === id ? { ...row, checked } : row)) });
      await runPacking("לא ניתן לשמור את הסימון", async () => {
        const { error: updateError } = await supabaseRef.current.from("packing_items").update({ checked }).eq("id", id);
        return Boolean(updateError);
      });
    },
    [rememberPacking, runPacking],
  );

  const setPackingItemQuantity = useCallback(
    async (id: string, quantity: number) => {
      const current = packingItemsRef.current.find((row) => row.id === id);
      if (!current || current.quantity === quantity) return;
      rememberPacking({ items: packingItemsRef.current.map((row) => (row.id === id ? { ...row, quantity } : row)) });
      await runPacking("לא ניתן לשמור את הכמות", async () => {
        const { error: updateError } = await supabaseRef.current.from("packing_items").update({ quantity }).eq("id", id);
        return Boolean(updateError);
      });
    },
    [rememberPacking, runPacking],
  );

  const rememberEvents = useCallback((next: AccountEvent[]) => {
    eventsGen.current += 1;
    eventsRef.current = next;
    flushSync(() => setEvents(next));
  }, []);

  const saveEvent = useCallback(
    async (draft: EventDraft & { id?: string; imageFile: File | null; removeImage: boolean }) => {
      const message = eventDraftError(draft);
      if (message) {
        setError(message);
        return false;
      }
      const fields = eventRecord(draft);
      const existing = draft.id ? eventsRef.current.find((row) => row.id === draft.id) : undefined;
      const id = existing?.id ?? crypto.randomUUID();
      const imagePath = draft.removeImage ? null : existing?.image_path ?? null;
      const row: AccountEvent = {
        id,
        account_id: accountId,
        kind: fields.kind,
        name: fields.name,
        label: fields.label,
        month: fields.month,
        day: fields.day,
        year: fields.year,
        comments: fields.comments,
        image_path: imagePath,
      };
      rememberEvents(existing ? eventsRef.current.map((entry) => (entry.id === id ? row : entry)) : [...eventsRef.current, row]);
      eventsWrites.current += 1;
      const previousPath = existing?.image_path ?? null;
      let failed = false;
      try {
        const payload = {
          id,
          account_id: accountId,
          kind: row.kind,
          name: row.name,
          label: row.label,
          month: row.month,
          day: row.day,
          year: row.year,
          comments: row.comments,
          image_path: row.image_path,
        };
        const { error: saveError } = existing
          ? await supabaseRef.current.from("events").update(payload).eq("id", id)
          : await supabaseRef.current.from("events").insert(payload);
        if (saveError) throw new Error("save");
        if (draft.imageFile) {
          const uploaded = await uploadEventImage(supabaseRef.current, accountId, id, draft.imageFile, previousPath);
          if (!uploaded) {
            if (!existing) {
              await supabaseRef.current.from("events").delete().eq("id", id);
              rememberEvents(eventsRef.current.filter((entry) => entry.id !== id));
            }
            throw new Error("image");
          }
          const next = eventsRef.current.map((entry) => (entry.id === id ? { ...entry, image_path: uploaded } : entry));
          rememberEvents(next);
          const previewUrl = URL.createObjectURL(draft.imageFile);
          setPreviews((current) => ({ ...current, [`event:${id}`]: previewUrl }));
          setImageSrcs((current) => ({ ...current, [uploaded]: previewUrl }));
        } else if (previousPath && previousPath !== row.image_path) {
          await supabaseRef.current.storage.from("item-images").remove([previousPath]);
          await forgetCachedImage(previousPath);
        }
        setError(null);
      } catch {
        failed = true;
        setError("לא ניתן לשמור את האירוע");
      } finally {
        eventsWrites.current = Math.max(0, eventsWrites.current - 1);
        eventsGen.current += 1;
        if (eventsWrites.current === 0) await refetch();
      }
      return !failed;
    },
    [accountId, rememberEvents, refetch],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const current = eventsRef.current.find((row) => row.id === id);
      if (!current) return;
      rememberEvents(eventsRef.current.filter((row) => row.id !== id));
      eventsWrites.current += 1;
      try {
        const { error: deleteError } = await supabaseRef.current.from("events").delete().eq("id", id);
        if (deleteError) throw new Error("delete");
        setPreviews((existing) => {
          const key = `event:${id}`;
          if (!existing[key]) return existing;
          const next = { ...existing };
          delete next[key];
          return next;
        });
        if (current.image_path) {
          await supabaseRef.current.storage.from("item-images").remove([current.image_path]);
          await forgetCachedImage(current.image_path);
        }
        setError(null);
      } catch {
        setError("לא ניתן למחוק את האירוע");
      } finally {
        eventsWrites.current = Math.max(0, eventsWrites.current - 1);
        eventsGen.current += 1;
        if (eventsWrites.current === 0) await refetch();
      }
    },
    [rememberEvents, refetch],
  );

  const syncingGrocery = useRef({ running: false, again: false });
  const groceryRetry = useRef(0);
  const groceryRetryTimer = useRef(0);
  const grocerySyncError = "לא ניתן לעדכן את רשימת הקניות. ננסה שוב כשהרשת תחזור";
  const syncPendingGrocery = useCallback(async () => {
    if (syncingGrocery.current.running) {
      syncingGrocery.current.again = true;
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    syncingGrocery.current.running = true;
    let paused = false;
    const supabase = supabaseRef.current;
    const stillCurrent = (entry: { itemId: string; revision: number }) =>
      readPendingGrocery(accountId).some((row) => row.itemId === entry.itemId && row.revision === entry.revision);
    try {
      for (;;) {
        const entry = readPendingGrocery(accountId)[0];
        if (!entry) break;
        let outcome: "ok" | "offline" | "rejected" = "ok";
        try {
          if (entry.removed) {
            const { error: deleteError } = await supabase
              .from("grocery_items")
              .delete()
              .eq("account_id", accountId)
              .eq("item_id", entry.itemId);
            if (deleteError) outcome = isOfflineError(deleteError) ? "offline" : "rejected";
          } else {
            const { data, error } = await supabase
              .from("grocery_items")
              .select("id")
              .eq("account_id", accountId)
              .eq("item_id", entry.itemId)
              .maybeSingle();
            if (error) outcome = isOfflineError(error) ? "offline" : "rejected";
            else if (!stillCurrent(entry)) {
              // A newer local change replaced this one while it was being saved.
            } else if (data) {
              const { error: updateError } = await supabase.from("grocery_items").update({ checked: entry.checked }).eq("id", data.id);
              if (updateError) outcome = isOfflineError(updateError) ? "offline" : "rejected";
            } else {
              const { error: insertError } = await supabase.from("grocery_items").insert({
                id: entry.localId,
                account_id: accountId,
                item_id: entry.itemId,
                checked: entry.checked,
              });
              if (insertError) {
                if (isOfflineError(insertError)) outcome = "offline";
                else if (insertError.code === "23505") {
                  const { error: updateError } = await supabase
                    .from("grocery_items")
                    .update({ checked: entry.checked })
                    .eq("account_id", accountId)
                    .eq("item_id", entry.itemId);
                  if (updateError) outcome = isOfflineError(updateError) ? "offline" : "rejected";
                } else outcome = "rejected";
              }
              if (!insertError && !stillCurrent(entry)) {
                await supabase.from("grocery_items").delete().eq("account_id", accountId).eq("item_id", entry.itemId);
              }
            }
          }
        } catch (error) {
          outcome = isOfflineError(error instanceof Error ? error : null) ? "offline" : "rejected";
        }
        if (outcome === "offline" || outcome === "rejected") {
          paused = true;
          break;
        }
        if (forgetPendingGrocery(accountId, entry.itemId, entry.revision)) groceryGen.current += 1;
      }
    } finally {
      syncingGrocery.current.running = false;
      const again = syncingGrocery.current.again;
      syncingGrocery.current.again = false;
      if (paused) {
        const attempt = groceryRetry.current + 1;
        groceryRetry.current = attempt;
        if (attempt >= 8) setError(grocerySyncError);
        window.clearTimeout(groceryRetryTimer.current);
        groceryRetryTimer.current = window.setTimeout(() => {
          void syncPendingGrocery();
        }, Math.min(30000, 1500 * attempt));
      } else {
        groceryRetry.current = 0;
        window.clearTimeout(groceryRetryTimer.current);
        setError((current) => (current === grocerySyncError ? null : current));
        if (again && navigator.onLine) void syncPendingGrocery();
      }
    }
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    setGrocery((current) => mergePendingGrocery(accountId, current));
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    const sync = () => {
      groceryRetry.current = 0;
      window.clearTimeout(groceryRetryTimer.current);
      void syncPendingGrocery().then(() => {
        if (readPendingGrocery(accountId).length === 0) void refetch();
      });
    };
    window.addEventListener("online", sync);
    if (readPendingGrocery(accountId).length > 0) sync();
    return () => {
      window.removeEventListener("online", sync);
      window.clearTimeout(groceryRetryTimer.current);
    };
  }, [accountId, refetch, syncPendingGrocery]);

  const commitGrocery = useCallback((next: GroceryLine[]) => {
    groceryGen.current += 1;
    groceryRef.current = next;
    flushSync(() => setGrocery(next));
  }, []);

  const value = useMemo<ListsContextValue | null>(() => {
    if (!accountId) return null;
    return {
      accountId,
      username,
      sections,
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
            account_id: accountId,
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
          const uploaded = await upload(supabaseRef.current, accountId, "category", category.id, imageFile, setPreviews, setCategories, setItems);
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
          const uploaded = await upload(supabaseRef.current, accountId, "category", input.id, input.imageFile, setPreviews, setCategories, setItems);
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
        const folder = `${accountId}/items/${id}`;
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
        const pending = readPendingGrocery(accountId).find((entry) => entry.itemId === id);
        if (pending) forgetPendingGrocery(accountId, id, pending.revision);
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
            account_id: accountId,
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
          .eq("account_id", accountId)
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
            const uploaded = await upload(supabase, accountId, "item", input.id, input.imageFile, setPreviews, setCategories, setItems);
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
            account_id: accountId,
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
          const uploaded = await upload(supabase, accountId, "item", item.id, input.imageFile, setPreviews, setCategories, setItems);
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
        const existing = groceryRef.current.find((line) => line.item_id === itemId);
        const localId = existing?.id ?? crypto.randomUUID();
        if (existing && !existing.checked) return;
        rememberPendingGrocery(accountId, itemId, false, localId);
        const optimistic: GroceryLine = {
          id: localId,
          account_id: accountId,
          item_id: itemId,
          checked: false,
        };
        commitGrocery(
          existing
            ? groceryRef.current.map((line) => (line.item_id === itemId ? { ...line, checked: false } : line))
            : [...groceryRef.current, optimistic],
        );
        void syncPendingGrocery();
      },
      async setChecked(itemId, checked) {
        const existing = groceryRef.current.find((line) => line.item_id === itemId);
        if (!existing || existing.checked === checked) return;
        rememberPendingGrocery(accountId, itemId, checked, existing.id);
        commitGrocery(groceryRef.current.map((line) => (line.item_id === itemId ? { ...line, checked } : line)));
        void syncPendingGrocery();
      },
      async removeFromGrocery(itemId) {
        const existing = groceryRef.current.find((line) => line.item_id === itemId);
        if (!existing) return;
        rememberPendingGrocery(accountId, itemId, existing.checked, existing.id, true);
        commitGrocery(groceryRef.current.filter((line) => line.item_id !== itemId));
        void syncPendingGrocery();
      },
      async clearPurchased() {
        const purchased = groceryRef.current.filter((line) => line.checked);
        if (purchased.length === 0) return;
        for (const line of purchased) rememberPendingGrocery(accountId, line.item_id, true, line.id, true);
        commitGrocery(groceryRef.current.filter((line) => !line.checked));
        void syncPendingGrocery();
      },
      async importInventory(file: File, options?: { recipes?: "replace" | "append"; only?: "packing" | "packing-list" }, onProgress?: (ratio: number) => void) {
        importingRef.current = true;
        reorderRef.current = false;
        setReorderMode(false);
        setSaving(true);
        setError(null);
        try {
          const imported = await replaceInventory(supabaseRef.current, accountId, file, onProgress, options);
          if (imported.categories && imported.items) {
            setCategories(imported.categories);
            setItems(imported.items);
            setPreviews({});
          }
          if (imported.grocery !== null) {
            clearPendingGrocery(accountId);
            groceryGen.current += 1;
            groceryRef.current = imported.grocery;
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
          if (imported.packing) {
            packingGen.current += 1;
            const nextLists = imported.packingAppend ? [...packingListsRef.current, ...imported.packing.lists] : imported.packing.lists;
            const nextCategories = imported.packingAppend ? [...packingCategoriesRef.current, ...imported.packing.categories] : imported.packing.categories;
            const nextItems = imported.packingAppend ? [...packingItemsRef.current, ...imported.packing.items] : imported.packing.items;
            packingListsRef.current = nextLists;
            packingCategoriesRef.current = nextCategories;
            packingItemsRef.current = nextItems;
            setPackingLists(nextLists);
            setPackingCategories(nextCategories);
            setPackingItems(nextItems);
            setPackingReady(true);
          }
          if (imported.events) {
            eventsGen.current += 1;
            eventsRef.current = imported.events;
            setEvents(imported.events);
            setEventsReady(true);
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
        const lines = groceryRef.current;
        if (lines.length === 0) return;
        for (const line of lines) rememberPendingGrocery(accountId, line.item_id, line.checked, line.id, true);
        commitGrocery([]);
        void syncPendingGrocery();
      },
      async uploadImage(kind, id, file) {
        setError(null);
        const uploaded = await upload(supabaseRef.current, accountId, kind, id, file, setPreviews, setCategories, setItems);
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
      setChecklistPriority,
      deleteChecklistRow,
      packingLists: sortByOrder(packingLists),
      packingCategories: sortByOrder(packingCategories),
      packingItems: sortByOrder(packingItems),
      packingReady,
      addPackingList,
      duplicatePackingList,
      renamePackingList,
      setPackingFavorite,
      deletePackingList,
      movePackingList,
      setPackingListChecked,
      addPackingCategory,
      renamePackingCategory,
      deletePackingCategory,
      movePackingCategory,
      movePackingItem,
      sortPackingItems,
      addPackingItem,
      renamePackingItem,
      deletePackingItem,
      setPackingItemChecked,
      setPackingItemQuantity,
      events: sortEvents(events),
      eventsReady,
      saveEvent,
      deleteEvent,
    };
  }, [
    addChecklistRow,
    addPackingCategory,
    addPackingItem,
    addPackingList,
    duplicatePackingList,
    categories,
    commitGrocery,
    stores,
    storesError,
    checklist,
    checklistError,
    deleteChecklistRow,
    deletePackingCategory,
    deletePackingItem,
    deletePackingList,
    deleteEvent,
    error,
    events,
    eventsReady,
    grocery,
    imageSrc,
    accountId,
    username,
    sections,
    items,
    movePackingCategory,
    movePackingItem,
    movePackingList,
    packingCategories,
    packingItems,
    packingLists,
    packingReady,
    refetch,
    renamePackingCategory,
    renamePackingItem,
    renamePackingList,
    reorderMode,
    setPackingFavorite,
    setPackingItemChecked,
    setPackingItemQuantity,
    setPackingListChecked,
    sortPackingItems,
    syncPendingGrocery,
    saveEvent,
    saving,
    setChecklistBody,
    setChecklistChecked,
    setChecklistPriority,
    moveChecklist,
    setChecklistIndent,
  ]);

  return (
    <BootContext.Provider value={bootError}>
      <ListsContext.Provider value={value}>{children}</ListsContext.Provider>
    </BootContext.Provider>
  );
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
  const unit = isUnitId(row.unit) ? row.unit : "unit";
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

async function uploadEventImage(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  id: string,
  file: File,
  previousPath: string | null,
) {
  const compressed = await compressImage(file);
  const extension = compressed.contentType === "image/webp" ? "webp" : "jpg";
  const path = `${accountId}/events/${id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("item-images").upload(path, compressed.blob, {
    contentType: compressed.contentType,
    upsert: false,
  });
  if (uploadError) return null;
  await writeCachedImage(path, compressed.blob);
  const { error: updateError } = await supabase.from("events").update({ image_path: path }).eq("id", id);
  if (updateError) {
    await supabase.storage.from("item-images").remove([path]);
    return null;
  }
  if (previousPath && previousPath !== path) {
    await supabase.storage.from("item-images").remove([previousPath]);
    await forgetCachedImage(previousPath);
  }
  return path;
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
