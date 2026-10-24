import { readCachedImage, writeCachedImage } from "@/lib/image-cache";
import { recipeArchiveFiles } from "@/lib/recipe-transfer";
import { createClient } from "@/lib/supabase/client";
import { zipStoreAsync } from "@/lib/zip-async";
import type { Category, ChecklistRow, GroceryLine, Item, Store } from "@/lib/types";

export type ExportSelection = {
  inventory: boolean;
  grocery: boolean;
  lists: boolean;
  recipes: boolean;
};

type Supabase = ReturnType<typeof createClient>;

function extension(path: string) {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1].toLowerCase() : "jpg";
}

function within(promise: Promise<Blob | null>, ms: number) {
  return new Promise<Blob | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

async function imageBlob(supabase: Supabase, path: string) {
  const cached = await readCachedImage(path);
  if (cached) return cached;
  const downloaded = await within(
    supabase.storage
      .from("item-images")
      .download(path)
      .then(({ data, error }) => (error || !data ? null : data)),
    15000,
  );
  if (!downloaded) return null;
  await writeCachedImage(path, downloaded);
  return downloaded;
}

async function mapPool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await task(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function downloadInventoryZip(
  supabase: Supabase,
  accountId: string,
  categories: Category[],
  items: Item[],
  checklist: ChecklistRow[],
  stores: Store[] = [],
  grocery: GroceryLine[] = [],
  selection: ExportSelection = { inventory: true, grocery: false, lists: true, recipes: false },
  onProgress?: (ratio: number) => void,
) {
  if (!selection.inventory && !selection.grocery && !selection.lists && !selection.recipes) return;
  onProgress?.(0);
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  const jobs: { key: string; path: string; fileName: string }[] = [];
  if (selection.inventory) {
    for (const category of categories) {
      if (category.image_path) {
        jobs.push({
          key: `category:${category.id}`,
          path: category.image_path,
          fileName: `images/category-${category.id}.${extension(category.image_path)}`,
        });
      }
    }
    for (const item of items) {
      if (item.image_path) {
        jobs.push({
          key: `item:${item.id}`,
          path: item.image_path,
          fileName: `images/item-${item.id}.${extension(item.image_path)}`,
        });
      }
    }
  }
  const imageShare = selection.recipes ? 0.2 : 0.95;
  let imagesDone = 0;
  const loaded = await mapPool(jobs, 6, async (job) => {
    const blob = await imageBlob(supabase, job.path);
    imagesDone += 1;
    if (jobs.length > 0) onProgress?.(Math.min(imageShare, (imagesDone / jobs.length) * imageShare));
    if (!blob) return null;
    return { key: job.key, fileName: job.fileName, data: new Uint8Array(await blob.arrayBuffer()) };
  });
  const byKey = new Map(loaded.flatMap((entry) => (entry ? [[entry.key, entry] as const] : [])));
  const files = loaded.flatMap((entry) => (entry ? [{ name: entry.fileName, data: entry.data }] : []));
  const document: Record<string, unknown> = { exportedAt: new Date().toISOString() };
  if (selection.inventory) {
    document.categories = [...categories]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        sortOrder: category.sort_order,
        store: stores.find((store) => store.id === category.store_id)?.name ?? null,
        separatorAfter: category.separator_after === true,
        image: byKey.get(`category:${category.id}`)?.fileName ?? null,
        items: items
          .filter((item) => item.category_id === category.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((item) => ({
            id: item.id,
            categoryId: category.id,
            name: item.name,
            unit: item.unit,
            quantity: item.quantity,
            comments: item.comments,
            sortOrder: item.sort_order,
            image: byKey.get(`item:${item.id}`)?.fileName ?? null,
          })),
      }));
  }
  if (selection.grocery) {
    document.grocery = grocery.flatMap((line) => {
      const item = items.find((entry) => entry.id === line.item_id);
      if (!item) return [];
      const category = categories.find((entry) => entry.id === item.category_id);
      return [{ itemId: item.id, category: category?.name ?? "", item: item.name, checked: line.checked }];
    });
  }
  if (selection.lists) {
    document.lists = [...checklist]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row) => ({
        body: row.body,
        indent: row.indent,
        checked: row.checked,
        sortOrder: row.sort_order,
      }));
  }
  const archive = [...files];
  if (selection.inventory || selection.grocery || selection.lists) {
    archive.unshift({ name: "inventory.json", data: new TextEncoder().encode(JSON.stringify(document, null, 2)) });
  }
  if (selection.recipes) {
    const recipeFiles = await recipeArchiveFiles(supabase, accountId, (ratio) => onProgress?.(imageShare + ratio * (0.95 - imageShare)));
    for (const file of recipeFiles) archive.push(file);
  }
  const zip = await zipStoreAsync(archive);
  onProgress?.(1);
  const blob = new Blob([zip], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  const day = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `cnaanlist-inventory-${day}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}
