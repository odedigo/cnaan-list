import { openZip, readInventoryFiles, readPackingListFile, type ImportedEvent, type ImportedGroceryLine, type ImportedPackingList, type ImportedPhoto } from "@/lib/inventory-file";
import { writeCachedImage } from "@/lib/image-cache";
import { compressImage } from "@/lib/images";
import { importRecipes } from "@/lib/recipe-transfer";
import { createClient } from "@/lib/supabase/client";
import type { AccountEvent, Category, ChecklistRow, GroceryLine, Item, PackingCategory, PackingItem, PackingList } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

const imageLimit = 5 * 1024 * 1024;

export async function replaceInventory(
  supabase: Supabase,
  accountId: string,
  file: File,
  onProgress?: (ratio: number) => void,
  options?: { recipes?: "replace" | "append"; only?: "packing" | "packing-list" },
): Promise<{ categories: Category[] | null; items: Item[] | null; grocery: GroceryLine[] | null; checklist: ChecklistRow[] | null; recipes: boolean; packing: { lists: PackingList[]; categories: PackingCategory[]; items: PackingItem[] } | null; packingAppend: boolean; events: AccountEvent[] | null }> {
  let reported = 0;
  const report = (ratio: number) => {
    const next = Math.max(reported, Math.min(1, ratio));
    if (next === reported) return;
    reported = next;
    onProgress?.(next);
  };
  report(0);
  const bytes = new Uint8Array(await file.arrayBuffer());
  report(0.01);
  if (options?.only === "packing-list") {
    const packing = await appendPacking(supabase, accountId, readPackingListFile(bytes));
    report(1);
    return { categories: null, items: null, grocery: null, checklist: null, recipes: false, packing, packingAppend: true, events: null };
  }
  const files = await openZip(bytes, (ratio) => report(0.01 + ratio * 0.07));
  const inventory = readInventoryFiles(files);
  if (options?.only === "packing") {
    if (!inventory.packing) throw new Error("הקובץ אינו כולל רשימות אריזה");
    const packing = await replacePacking(supabase, accountId, inventory.packing);
    report(1);
    return { categories: null, items: null, grocery: null, checklist: null, recipes: false, packing, packingAppend: false, events: null };
  }
  const hasCategories = inventory.categories !== null;
  const plan = (inventory.categories ?? [])
    .map((category, index) => ({ category, index }))
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.index - b.index)
    .map(({ category }) => {
      const id = crypto.randomUUID();
      const items = [...category.items]
        .map((item, index) => ({ item, index }))
        .sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.index - b.index)
        .map(({ item }) => ({
          id: crypto.randomUUID(),
          categoryId: id,
          name: item.name,
          unit: item.unit,
          comments: item.comments,
          quantity: item.quantity,
          sortOrder: item.sortOrder,
          sourceId: item.sourceId,
          image: item.image,
          imagePath: null as string | null,
        }));
      return {
        id,
        name: category.name,
        color: category.color,
        sortOrder: category.sortOrder,
        store: category.store,
        separatorAfter: category.separatorAfter,
        separatorText: category.separatorText,
        image: category.image,
        imagePath: null as string | null,
        items,
      };
    });
  const photos = plan.flatMap((category) => [
    ...(category.image ? [{ owner: category, photo: category.image, folder: "categories" as const }] : []),
    ...category.items.flatMap((item) => (item.image ? [{ owner: item, photo: item.image, folder: "items" as const }] : [])),
  ]);
  const checklist =
    inventory.lists?.map((row) => ({
      id: crypto.randomUUID(),
      account_id: accountId,
      body: row.body,
      indent: row.indent,
      checked: row.checked,
      sort_order: row.sortOrder,
      priority: row.priority,
    })) ?? null;
  const steps = Math.max(
    1,
    photos.length +
      chunkCount(plan.length) +
      chunkCount(plan.reduce((sum, category) => sum + category.items.length, 0)) +
      (checklist ? chunkCount(checklist.length) + 1 : 0) +
      2,
  );
  let completed = 0;
  const sharesImport = Boolean(options?.recipes && files.has("recipes.json") && (hasCategories || inventory.grocery || inventory.lists));
  const scale = sharesImport ? 0.5 : 1;
  const tick = (count = 1) => {
    completed += count;
    report(Math.min(scale, (completed / steps) * scale));
  };
  const uploaded: string[] = [];
  let categories: Category[] = [];
  const { data: storeRows } = await supabase.from("stores").select("id, name, protected").eq("account_id", accountId);
  const knownStores = (storeRows ?? []) as { id: string; name: string; protected: boolean }[];
  const fallbackStoreId = knownStores.find((store) => store.protected)?.id ?? knownStores[0]?.id ?? "";
  const storeIdFor = (name: string | null) => {
    if (!name) return fallbackStoreId;
    return (
      knownStores.find((store) => store.name.toLocaleLowerCase("he") === name.toLocaleLowerCase("he"))?.id ?? fallbackStoreId
    );
  };
  let items: Item[] = [];
  try {
    await mapPool(photos, 4, async (job) => {
      const prepared = await imageBody(job.photo);
      const path = `${accountId}/${job.folder}/${job.owner.id}/${crypto.randomUUID()}.${extensionFor(prepared.contentType)}`;
      const { error } = await supabase.storage.from("item-images").upload(path, prepared.body, {
        contentType: prepared.contentType,
        upsert: false,
      });
      if (error) throw new Error("upload");
      uploaded.push(path);
      job.owner.imagePath = path;
      await writeCachedImage(path, prepared.body).catch(() => undefined);
      tick();
    });
    categories = plan.map((category) => {
      const storeId = storeIdFor(category.store);
      return {
        id: category.id,
        account_id: accountId,
        name: category.name,
        color: category.color,
        image_path: category.imagePath,
        sort_order: category.sortOrder,
        store_id: storeId,
        separator_after: category.separatorAfter,
        separator_text: category.separatorAfter ? category.separatorText.trim() : "",
      };
    });
    items = plan.flatMap((category) =>
      category.items.map((item) => ({
        id: item.id,
        account_id: accountId,
        category_id: category.id,
        name: item.name,
        unit: item.unit,
        comments: item.comments,
        image_path: item.imagePath,
        quantity: item.quantity,
        sort_order: item.sortOrder,
      })),
    );
    for (const group of chunks(categories, 100)) {
      const rows = group.map((category) => {
        if (category.store_id) return category;
        const { store_id: _storeId, ...rest } = category;
        return rest;
      });
      const { error } = await supabase.from("categories").insert(rows);
      if (error) throw new Error("insert");
      tick();
    }
    for (const group of chunks(items, 100)) {
      const { error } = await supabase.from("items").insert(group);
      if (error) throw new Error("insert");
      tick();
    }
    for (const group of chunks(checklist ?? [], 100)) {
      const { error } = await supabase.from("checklist_rows").insert(group);
      if (error) throw new Error("insert");
      tick();
    }
  } catch {
    for (const group of chunks(
      plan.map((category) => category.id),
      100,
    )) {
      await supabase
        .from("categories")
        .delete()
        .in("id", group)
        .then(() => undefined, () => undefined);
    }
    for (const group of chunks((checklist ?? []).map((row) => row.id), 100)) {
      await supabase
        .from("checklist_rows")
        .delete()
        .in("id", group)
        .then(() => undefined, () => undefined);
    }
    for (const group of chunks(uploaded, 100)) {
      await supabase.storage
        .from("item-images")
        .remove(group)
        .then(() => undefined, () => undefined);
    }
    throw new Error("לא ניתן לייבא את הרשימה");
  }
  if (hasCategories) {
    const keep = new Set(plan.map((category) => category.id));
    const { data: existing, error: listError } = await supabase.from("categories").select("id").eq("account_id", accountId);
    if (listError) throw new Error("לא ניתן לייבא את הרשימה");
    const remove = (existing ?? []).map((row) => row.id).filter((id) => !keep.has(id));
    await removeRows(supabase, remove);
    tick();
  }
  if (checklist) {
    const keepLists = new Set(checklist.map((row) => row.id));
    const { data: existingLists, error: checklistError } = await supabase.from("checklist_rows").select("id").eq("account_id", accountId);
    if (checklistError) throw new Error("לא ניתן לייבא את הרשימה");
    const staleLists = (existingLists ?? []).map((row) => row.id).filter((id) => !keepLists.has(id));
    for (const group of chunks(staleLists, 100)) {
      const { error } = await supabase.from("checklist_rows").delete().in("id", group);
      if (error) throw new Error("לא ניתן לייבא את הרשימה");
    }
    tick();
  }
  const packing = inventory.packing ? await replacePacking(supabase, accountId, inventory.packing) : null;
  const events = inventory.events ? await replaceEvents(supabase, accountId, inventory.events) : null;
  if (hasCategories) {
    const eventPaths = events ? events.flatMap((event) => (event.image_path ? [event.image_path] : [])) : await keptEventImages(supabase, accountId);
    void removeReplacedImages(
      supabase,
      accountId,
      [
        ...plan.flatMap((category) => [category.imagePath, ...category.items.map((item) => item.imagePath)]).filter((path): path is string => Boolean(path)),
        ...eventPaths,
      ],
    );
    tick();
  }
  const itemIds = new Map(plan.flatMap((category) => category.items.flatMap((item) => (item.sourceId ? [[item.sourceId, item.id] as const] : []))));
  const grocery = inventory.grocery ? await replaceGrocery(supabase, accountId, inventory.grocery, hasCategories ? categories : null, hasCategories ? items : null, itemIds) : hasCategories ? [] : null;
  const importRecipeMode = options?.recipes;
  if (importRecipeMode && files.has("recipes.json")) {
    await importRecipes(supabase, accountId, files, importRecipeMode, (ratio) => report(sharesImport ? 0.5 + ratio / 2 : ratio));
  }
  report(1);
  return {
    categories: hasCategories ? categories : null,
    items: hasCategories ? items : null,
    grocery,
    checklist,
    recipes: Boolean(importRecipeMode && files.has("recipes.json")),
    packing,
    packingAppend: false,
    events,
  };
}

async function replaceEvents(supabase: Supabase, accountId: string, imported: ImportedEvent[]) {
  const { data: existing, error: listError } = await supabase.from("events").select("id, image_path").eq("account_id", accountId);
  if (listError) throw new Error("לא ניתן לייבא את הרשימה");
  const rows = imported.map((event) => ({
    id: crypto.randomUUID(),
    account_id: accountId,
    kind: event.kind,
    name: event.name,
    label: event.label,
    month: event.month,
    day: event.day,
    year: event.year,
    comments: event.comments,
    image_path: null as string | null,
    photo: event.image,
  }));
  const uploaded: string[] = [];
  try {
    await mapPool(
      rows.filter((row) => row.photo),
      4,
      async (row) => {
        const prepared = await imageBody(row.photo as ImportedPhoto);
        const path = `${accountId}/events/${row.id}/${crypto.randomUUID()}.${extensionFor(prepared.contentType)}`;
        const { error } = await supabase.storage.from("item-images").upload(path, prepared.body, {
          contentType: prepared.contentType,
          upsert: false,
        });
        if (error) throw new Error("upload");
        uploaded.push(path);
        row.image_path = path;
        await writeCachedImage(path, prepared.body).catch(() => undefined);
      },
    );
    for (const group of chunks(rows, 100)) {
      const { error } = await supabase.from("events").insert(group.map(({ photo: _photo, ...row }) => row));
      if (error) throw new Error("insert");
    }
  } catch {
    for (const group of chunks(rows.map((row) => row.id), 100)) {
      await supabase.from("events").delete().in("id", group).then(() => undefined, () => undefined);
    }
    for (const group of chunks(uploaded, 100)) {
      await supabase.storage.from("item-images").remove(group).then(() => undefined, () => undefined);
    }
    throw new Error("לא ניתן לייבא את הרשימה");
  }
  const keep = new Set(rows.map((row) => row.id));
  const stale = (existing ?? []).filter((row) => !keep.has(row.id));
  for (const group of chunks(stale.map((row) => row.id), 100)) {
    const { error } = await supabase.from("events").delete().in("id", group);
    if (error) throw new Error("לא ניתן לייבא את הרשימה");
  }
  const stalePaths = stale.flatMap((row) => (typeof row.image_path === "string" && row.image_path ? [row.image_path] : []));
  for (const group of chunks(stalePaths, 100)) {
    await supabase.storage.from("item-images").remove(group).then(() => undefined, () => undefined);
  }
  return rows.map(({ photo: _photo, ...row }) => row);
}

async function keptEventImages(supabase: Supabase, accountId: string) {
  const { data, error } = await supabase.from("events").select("image_path").eq("account_id", accountId);
  if (error) {
    if (missingEventsTable(error)) return [];
    throw new Error("לא ניתן לייבא את הרשימה");
  }
  return (data ?? []).flatMap((row) => (typeof row.image_path === "string" && row.image_path ? [row.image_path] : []));
}

function missingEventsTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205";
}

async function replaceGrocery(
  supabase: Supabase,
  accountId: string,
  lines: ImportedGroceryLine[],
  categories: Category[] | null,
  items: Item[] | null,
  itemIds: Map<string, string>,
) {
  let knownCategories = categories;
  let knownItems = items;
  if (!knownCategories || !knownItems) {
    const [{ data: categoryRows, error: categoryError }, { data: itemRows, error: itemError }] = await Promise.all([
      supabase.from("categories").select("id, name").eq("account_id", accountId),
      supabase.from("items").select("id, name, category_id").eq("account_id", accountId),
    ]);
    if (categoryError || itemError) throw new Error("לא ניתן לייבא את הרשימה");
    knownCategories = (categoryRows ?? []) as Category[];
    knownItems = (itemRows ?? []) as Item[];
  }
  const chosen = new Map<string, boolean>();
  for (const line of lines) {
    const mapped = line.itemId ? itemIds.get(line.itemId) : undefined;
    const itemId = mapped ?? matchItem(line, knownCategories, knownItems);
    if (itemId) chosen.set(itemId, line.checked);
  }
  const { error: deleteError } = await supabase.from("grocery_items").delete().eq("account_id", accountId);
  if (deleteError) throw new Error("לא ניתן לייבא את הרשימה");
  const rows: GroceryLine[] = [...chosen].map(([itemId, checked]) => ({
    id: crypto.randomUUID(),
    account_id: accountId,
    item_id: itemId,
    checked,
  }));
  for (const group of chunks(rows, 100)) {
    const { error } = await supabase.from("grocery_items").insert(group);
    if (error) throw new Error("לא ניתן לייבא את הרשימה");
  }
  return rows;
}

async function appendPacking(supabase: Supabase, accountId: string, list: ImportedPackingList) {
  const { data: latest, error: orderError } = await supabase.from("packing_lists").select("sort_order").eq("account_id", accountId).order("sort_order", { ascending: false }).limit(1);
  if (orderError) throw new Error("לא ניתן לייבא את הרשימה");
  const listId = crypto.randomUUID();
  const listRow: PackingList = {
    id: listId,
    account_id: accountId,
    name: list.name,
    favorite: list.favorite,
    sort_order: latest && latest.length > 0 ? Number(latest[0].sort_order) + 1 : 0,
  };
  const categoryRows: PackingCategory[] = [];
  const itemRows: PackingItem[] = [];
  const categories = [...list.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const category of categories) {
    const categoryId = crypto.randomUUID();
    categoryRows.push({
      id: categoryId,
      account_id: accountId,
      list_id: listId,
      name: category.name,
      color: category.color,
      sort_order: category.sortOrder,
    });
    const items = [...category.items].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const item of items) {
      itemRows.push({
        id: crypto.randomUUID(),
        account_id: accountId,
        category_id: categoryId,
        name: item.name,
        quantity: item.quantity,
        checked: item.checked,
        sort_order: item.sortOrder,
      });
    }
  }
  const { error: listError } = await supabase.from("packing_lists").insert(listRow);
  if (listError) throw new Error("לא ניתן לייבא את הרשימה");
  try {
    for (const group of chunks(categoryRows, 100)) {
      const { error } = await supabase.from("packing_categories").insert(group);
      if (error) throw new Error("לא ניתן לייבא את הרשימה");
    }
    for (const group of chunks(itemRows, 100)) {
      const { error } = await supabase.from("packing_items").insert(group);
      if (error) throw new Error("לא ניתן לייבא את הרשימה");
    }
    return { lists: [listRow], categories: categoryRows, items: itemRows };
  } catch (error) {
    await supabase.from("packing_lists").delete().eq("id", listId).then(() => undefined, () => undefined);
    throw error instanceof Error && error.message ? error : new Error("לא ניתן לייבא את הרשימה");
  }
}

async function replacePacking(supabase: Supabase, accountId: string, lists: ImportedPackingList[]) {
  const ordered = lists
    .map((list, index) => ({ list, index }))
    .sort((a, b) => a.list.sortOrder - b.list.sortOrder || a.index - b.index)
    .map(({ list }) => list);
  const listRows: PackingList[] = [];
  const categoryRows: PackingCategory[] = [];
  const itemRows: PackingItem[] = [];
  for (const list of ordered) {
    const listId = crypto.randomUUID();
    listRows.push({
      id: listId,
      account_id: accountId,
      name: list.name,
      favorite: list.favorite,
      sort_order: list.sortOrder,
    });
    const categories = [...list.categories].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const category of categories) {
      const categoryId = crypto.randomUUID();
      categoryRows.push({
        id: categoryId,
        account_id: accountId,
        list_id: listId,
        name: category.name,
        color: category.color,
        sort_order: category.sortOrder,
      });
      const items = [...category.items].sort((a, b) => a.sortOrder - b.sortOrder);
      for (const item of items) {
        itemRows.push({
          id: crypto.randomUUID(),
          account_id: accountId,
          category_id: categoryId,
          name: item.name,
          quantity: item.quantity,
          checked: item.checked,
          sort_order: item.sortOrder,
        });
      }
    }
  }
  const created = listRows.map((row) => row.id);
  try {
    for (const group of chunks(listRows, 100)) {
      const { error } = await supabase.from("packing_lists").insert(group);
      if (error) throw new Error("לא ניתן לייבא את הרשימה");
    }
    for (const group of chunks(categoryRows, 100)) {
      const { error } = await supabase.from("packing_categories").insert(group);
      if (error) throw new Error("לא ניתן לייבא את הרשימה");
    }
    for (const group of chunks(itemRows, 100)) {
      const { error } = await supabase.from("packing_items").insert(group);
      if (error) throw new Error("לא ניתן לייבא את הרשימה");
    }
    const { data: existing, error: listError } = await supabase.from("packing_lists").select("id").eq("account_id", accountId);
    if (listError) throw new Error("לא ניתן לייבא את הרשימה");
    const keep = new Set(created);
    const stale = (existing ?? []).map((row) => row.id).filter((id) => !keep.has(id));
    for (const group of chunks(stale, 100)) {
      const { error } = await supabase.from("packing_lists").delete().in("id", group);
      if (error) throw new Error("לא ניתן לייבא את הרשימה");
    }
    return { lists: listRows, categories: categoryRows, items: itemRows };
  } catch (error) {
    for (const group of chunks(created, 100)) {
      await supabase
        .from("packing_lists")
        .delete()
        .in("id", group)
        .then(() => undefined, () => undefined);
    }
    throw error instanceof Error && error.message ? error : new Error("לא ניתן לייבא את הרשימה");
  }
}

function matchItem(line: ImportedGroceryLine, categories: Category[], items: Item[]) {
  const categoryName = line.category.toLocaleLowerCase("he");
  const itemName = line.item.toLocaleLowerCase("he");
  const categoryIds = new Set(categories.filter((category) => category.name.toLocaleLowerCase("he") === categoryName).map((category) => category.id));
  if (categoryName && categoryIds.size === 0) return null;
  return items.find((item) => item.name.toLocaleLowerCase("he") === itemName && (!categoryName || categoryIds.has(item.category_id)))?.id ?? null;
}

function chunkCount(count: number) {
  return count === 0 ? 0 : Math.ceil(count / 100);
}

async function removeRows(supabase: Supabase, ids: string[]) {
  for (const group of chunks(ids, 100)) {
    const { error } = await supabase.from("categories").delete().in("id", group);
    if (error) throw new Error("לא ניתן לייבא את הרשימה");
  }
}

async function imageBody(photo: ImportedPhoto): Promise<{ body: Blob; contentType: string }> {
  const contentType = photo.contentType;
  if (contentType && photo.bytes.byteLength <= imageLimit) {
    const copy = new Uint8Array(photo.bytes.byteLength);
    copy.set(photo.bytes);
    return { body: new Blob([copy], { type: contentType }), contentType };
  }
  const copy = new Uint8Array(photo.bytes.byteLength);
  copy.set(photo.bytes);
  const compressed = await compressImage(new File([copy], "image", { type: contentType ?? "image/jpeg" }));
  if (compressed.contentType !== "image/webp" && compressed.contentType !== "image/jpeg" && compressed.contentType !== "image/png") {
    throw new Error("image");
  }
  return { body: compressed.blob, contentType: compressed.contentType };
}

function extensionFor(contentType: string) {
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/png") return "png";
  return "jpg";
}

async function removeReplacedImages(supabase: Supabase, accountId: string, keepPaths: string[]) {
  const keep = new Set(keepPaths);
  let paths: string[] = [];
  try {
    paths = await listFiles(supabase, accountId);
  } catch {
    return;
  }
  const doomed = paths.filter((path) => !keep.has(path));
  for (const group of chunks(doomed, 100)) {
    await supabase.storage
      .from("item-images")
      .remove(group)
      .then(() => undefined, () => undefined);
  }
}

async function listFiles(supabase: Supabase, root: string) {
  const files: string[] = [];
  const queue = [root];
  const seen = new Set<string>();
  while (queue.length > 0 && files.length < 5000) {
    const folder = queue.shift() ?? "";
    if (seen.has(folder)) continue;
    seen.add(folder);
    let offset = 0;
    for (let page = 0; page < 50; page += 1) {
      const { data, error } = await supabase.storage.from("item-images").list(folder, { limit: 100, offset });
      if (error) throw error;
      const batch = data ?? [];
      for (const entry of batch) {
        if (!entry.name) continue;
        const path = `${folder}/${entry.name}`;
        if (entry.metadata == null) queue.push(path);
        else files.push(path);
      }
      if (batch.length < 100) break;
      offset += batch.length;
    }
  }
  return files;
}

function chunks<T>(values: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

async function mapPool<T>(values: T[], limit: number, task: (value: T) => Promise<void>) {
  let index = 0;
  async function worker() {
    while (index < values.length) {
      const current = index;
      index += 1;
      await task(values[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
}
