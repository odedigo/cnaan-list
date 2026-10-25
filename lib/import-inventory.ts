import { openZip, readInventoryFiles, type ImportedGroceryLine, type ImportedPhoto } from "@/lib/inventory-file";
import { writeCachedImage } from "@/lib/image-cache";
import { compressImage } from "@/lib/images";
import { importRecipes } from "@/lib/recipe-transfer";
import { createClient } from "@/lib/supabase/client";
import type { Category, ChecklistRow, GroceryLine, Item } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

const imageLimit = 5 * 1024 * 1024;

export async function replaceInventory(
  supabase: Supabase,
  accountId: string,
  file: File,
  onProgress?: (ratio: number) => void,
  options?: { recipes?: "replace" | "append" },
): Promise<{ categories: Category[] | null; items: Item[] | null; grocery: GroceryLine[] | null; checklist: ChecklistRow[] | null; recipes: boolean }> {
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
  const files = await openZip(bytes, (ratio) => report(0.01 + ratio * 0.07));
  const inventory = readInventoryFiles(files);
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
  if (hasCategories) {
    void removeReplacedImages(
      supabase,
      accountId,
      plan.flatMap((category) => [category.imagePath, ...category.items.map((item) => item.imagePath)]).filter((path): path is string => Boolean(path)),
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
  };
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
