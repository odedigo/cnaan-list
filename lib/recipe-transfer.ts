/** Move recipes, their categories, and their photos between accounts. */

import { readCachedImage, writeCachedImage } from "@/lib/image-cache";
import { createClient } from "@/lib/supabase/client";
import { InventoryFileError } from "@/lib/inventory-file";

type Supabase = ReturnType<typeof createClient>;

export const recipesImportedEvent = "cnaanlist-recipes-imported";

type CategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  image_path: string | null;
  sort_order: number;
};

type RecipeRow = {
  id: string;
  title: string;
  leaf_category_id: string;
  source_path: string | null;
  document: Record<string, unknown>;
  sort_order: number;
  rating: number | null;
  created_at: string;
};

type ExportedCategory = {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  image: string | null;
};

type ExportedRecipe = {
  id: string;
  title: string;
  leafCategoryId: string;
  sourcePath: string | null;
  sortOrder: number;
  rating: number | null;
  createdAt: string | null;
  labels: string[];
  document: Record<string, unknown>;
};

export async function recipeArchiveFiles(
  supabase: Supabase,
  accountId: string,
  onProgress?: (ratio: number) => void,
) {
  const [categories, recipes, labels] = await Promise.all([
    fetchRows<CategoryRow>((from, to) =>
      supabase.from("recipe_categories").select("id, parent_id, name, image_path, sort_order").eq("account_id", accountId).order("sort_order").range(from, to),
    ),
    fetchRows<RecipeRow>((from, to) =>
      supabase
        .from("recipes")
        .select("id, title, leaf_category_id, source_path, document, sort_order, rating, created_at")
        .eq("account_id", accountId)
        .order("sort_order")
        .range(from, to),
    ),
    fetchRows<{ recipe_id: string; category_id: string }>((from, to) => supabase.from("recipe_labels").select("recipe_id, category_id").range(from, to)),
  ]);
  const files: { name: string; data: Uint8Array<ArrayBuffer> }[] = [];
  const categoryImage = new Map<string, string>();
  const recipeImage = new Map<string, string>();
  const jobs: PictureJob[] = [];
  for (const category of categories) {
    if (!category.image_path) continue;
    jobs.push({
      kind: "category",
      id: category.id,
      path: category.image_path,
      name: `recipes/images/categories/${category.id}.${extension(category.image_path)}`,
    });
  }
  for (const recipe of recipes) {
    for (const image of storedImages(recipe.document)) {
      jobs.push({
        kind: "recipe",
        id: `${recipe.id}/${image.id}`,
        path: image.storagePath,
        name: `recipes/images/${recipe.id}/${safeName(image.id)}.${extension(image.storagePath)}`,
      });
    }
  }
  let picturesDone = 0;
  const tickPicture = () => {
    picturesDone += 1;
    if (jobs.length > 0) onProgress?.(Math.min(1, picturesDone / jobs.length));
  };
  await mapPool(jobs, 6, async (job) => {
    try {
      const bytes = await download(supabase, job.path);
      if (!bytes) return;
      files.push({ name: job.name, data: bytes });
      if (job.kind === "category") categoryImage.set(job.id, job.name);
      else recipeImage.set(job.id, job.name);
    } finally {
      tickPicture();
    }
  });
  const labelsByRecipe = new Map<string, string[]>();
  for (const label of labels) {
    const list = labelsByRecipe.get(label.recipe_id);
    if (list) list.push(label.category_id);
    else labelsByRecipe.set(label.recipe_id, [label.category_id]);
  }
  const exportedRecipes: ExportedRecipe[] = recipes.map((recipe) => {
    const images = Array.isArray(recipe.document.images) ? recipe.document.images : [];
    return {
      id: recipe.id,
      title: recipe.title,
      leafCategoryId: recipe.leaf_category_id,
      sourcePath: recipe.source_path,
      sortOrder: recipe.sort_order,
      rating: recipe.rating,
      createdAt: recipe.created_at,
      labels: labelsByRecipe.get(recipe.id) ?? [],
      document: {
        ...recipe.document,
        images: images.map((value) => {
          if (!value || typeof value !== "object") return value;
          const image = { ...(value as Record<string, unknown>) };
          const id = typeof image.id === "string" ? image.id : "";
          const file = id ? recipeImage.get(`${recipe.id}/${id}`) : undefined;
          delete image.storagePath;
          delete image.blob;
          if (file) image.file = file;
          return image;
        }),
      },
    };
  });
  const exportedCategories: ExportedCategory[] = categories.map((category) => ({
    id: category.id,
    parentId: category.parent_id,
    name: category.name,
    sortOrder: category.sort_order,
    image: categoryImage.get(category.id) ?? null,
  }));
  files.unshift({
    name: "recipes.json",
    data: new TextEncoder().encode(JSON.stringify({ categories: exportedCategories, recipes: exportedRecipes })),
  });
  if (jobs.length === 0) onProgress?.(1);
  return files;
}

type PictureJob = {
  kind: "category" | "recipe";
  id: string;
  path: string;
  name: string;
};

type PreparedCategory = {
  category: ExportedCategory;
  id: string;
  parentId: string | null;
  imagePath: string | null;
  depth: number;
  reused: boolean;
};

type PreparedRecipe = {
  id: string;
  leaf: string;
  recipe: ExportedRecipe;
  previous: { id: string; source_path: string | null; document: unknown } | undefined;
  document: Record<string, unknown>;
};

type PictureUpload = {
  file: string;
  folder: string;
  imageId: string;
  image: Record<string, unknown>;
};

type RecipeInsert = {
  id: string;
  account_id: string;
  title: string;
  leaf_category_id: string;
  source_path: string | null;
  document: Record<string, unknown>;
  sort_order: number;
  rating: number | null;
  created_at?: string;
};

function zipPictureCount(parsed: { categories: ExportedCategory[]; recipes: ExportedRecipe[] }) {
  const categories = parsed.categories.filter((category) => category.image).length;
  const recipes = parsed.recipes.reduce((count, recipe) => {
    const images = Array.isArray(recipe.document.images) ? recipe.document.images : [];
    return count + images.filter((value) => value && typeof value === "object" && text((value as { file?: unknown }).file)).length;
  }, 0);
  return categories + recipes;
}

function chunks<T>(values: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

function storedImages(document: Record<string, unknown>) {
  const images = Array.isArray(document.images) ? document.images : [];
  const stored: { id: string; storagePath: string }[] = [];
  for (const value of images) {
    if (!value || typeof value !== "object") continue;
    const image = value as Record<string, unknown>;
    const id = typeof image.id === "string" ? image.id : "";
    const storagePath = typeof image.storagePath === "string" ? image.storagePath : "";
    if (id && storagePath) stored.push({ id, storagePath });
  }
  return stored;
}

export async function importRecipes(
  supabase: Supabase,
  accountId: string,
  files: Map<string, Uint8Array>,
  mode: "replace" | "append",
  onProgress?: (ratio: number) => void,
) {
  const parsed = parseRecipes(files);
  if (!parsed) return;
  const uploaded: string[] = [];
  const steps = Math.max(1, parsed.categories.length + parsed.recipes.length + zipPictureCount(parsed) + 2);
  let completed = 0;
  const cleanupShare = mode === "replace" ? 0.15 : 0;
  const tick = () => {
    completed += 1;
    onProgress?.(Math.min(1, cleanupShare + (completed / steps) * (1 - cleanupShare)));
  };
  try {
    onProgress?.(0.01);
    if (mode === "replace") {
      const { error } = await supabase.from("recipe_categories").delete().eq("account_id", accountId).is("parent_id", null).neq("name", "מועדפים");
      if (error) throw error;
      let listed = 0;
      await removeAccountImages(supabase, accountId, () => {
        listed += 1;
        onProgress?.(Math.min(cleanupShare, 0.01 + 0.14 * (1 - 1 / (1 + listed / 40))));
      });
    }
    tick();
    const existingCategories = mode === "append" ? await fetchRows<CategoryRow>((from, to) => supabase.from("recipe_categories").select("id, parent_id, name, image_path, sort_order").eq("account_id", accountId).range(from, to)) : [];
    const existingRecipes = mode === "append" ? await fetchRows<{ id: string; source_path: string | null; document: unknown }>((from, to) => supabase.from("recipes").select("id, source_path, document").eq("account_id", accountId).range(from, to)) : [];
    const categoryIds = new Map<string, string>();
    const byPath = new Map<string, string>();
    if (mode === "append") {
      const byId = new Map(existingCategories.map((category) => [category.id, category]));
      for (const category of existingCategories) {
        const names: string[] = [];
        let current: CategoryRow | undefined = category;
        const seen = new Set<string>();
        while (current && !seen.has(current.id)) {
          seen.add(current.id);
          names.push(current.name);
          current = current.parent_id ? byId.get(current.parent_id) : undefined;
        }
        byPath.set(names.reverse().join("/"), category.id);
      }
    }
    const ordered = [...parsed.categories].sort((a, b) => depth(a, parsed.categories) - depth(b, parsed.categories));
    const preparedCategories: PreparedCategory[] = [];
    for (const category of ordered) {
      const parentId = category.parentId ? categoryIds.get(category.parentId) ?? null : null;
      if (category.parentId && !parentId) throw new Error("parent");
      const path = categoryPath(category, parsed.categories);
      const found = byPath.get(path);
      if (found) {
        categoryIds.set(category.id, found);
        preparedCategories.push({ category, id: found, parentId, imagePath: null, depth: depth(category, parsed.categories), reused: true });
        tick();
        continue;
      }
      const id = crypto.randomUUID();
      categoryIds.set(category.id, id);
      byPath.set(path, id);
      preparedCategories.push({ category, id, parentId, imagePath: null, depth: depth(category, parsed.categories), reused: false });
    }
    await mapPool(
      preparedCategories.filter((category) => !category.reused && category.category.image),
      6,
      async (category) => {
        const imagePath = await uploadZipImage(supabase, accountId, files, category.category.image as string, `${accountId}/categories/${category.id}`);
        if (imagePath) {
          uploaded.push(imagePath);
          category.imagePath = imagePath;
        }
        tick();
      },
    );
    const freshCategories = preparedCategories.filter((category) => !category.reused);
    const deepest = freshCategories.reduce((max, category) => Math.max(max, category.depth), 0);
    for (let level = 0; level <= deepest; level += 1) {
      const rows = freshCategories
        .filter((category) => category.depth === level)
        .map((category) => ({
          id: category.id,
          account_id: accountId,
          parent_id: category.parentId,
          name: clip(category.category.name, 120),
          image_path: category.imagePath,
          sort_order: category.category.sortOrder,
        }));
      for (const group of chunks(rows, 100)) {
        const { error } = await supabase.from("recipe_categories").insert(group);
        if (error) throw error;
        group.forEach(tick);
      }
    }
    const sourceIndex = new Map(existingRecipes.filter((recipe) => recipe.source_path).map((recipe) => [recipe.source_path as string, recipe]));
    const preparedRecipes: PreparedRecipe[] = [];
    const sourceSlot = new Map<string, PreparedRecipe>();
    for (const recipe of parsed.recipes) {
      const leaf = categoryIds.get(recipe.leafCategoryId);
      if (!leaf) continue;
      const earlier = recipe.sourcePath ? sourceSlot.get(recipe.sourcePath) : undefined;
      if (earlier) {
        earlier.recipe = recipe;
        earlier.leaf = leaf;
        continue;
      }
      const previous = recipe.sourcePath ? sourceIndex.get(recipe.sourcePath) : undefined;
      const prepared: PreparedRecipe = {
        id: previous?.id ?? crypto.randomUUID(),
        leaf,
        recipe,
        previous,
        document: recipe.document,
      };
      preparedRecipes.push(prepared);
      if (recipe.sourcePath) sourceSlot.set(recipe.sourcePath, prepared);
    }
    const pictureJobs: PictureUpload[] = [];
    for (const prepared of preparedRecipes) {
      const images = Array.isArray(prepared.recipe.document.images) ? prepared.recipe.document.images : [];
      const next = [];
      for (const value of images) {
        if (!value || typeof value !== "object") continue;
        const image = { ...(value as Record<string, unknown>) };
        const file = text(image.file);
        delete image.file;
        delete image.storagePath;
        delete image.blob;
        if (file) pictureJobs.push({ file, folder: `${accountId}/${prepared.id}`, imageId: text(image.id) || crypto.randomUUID(), image });
        if (typeof image.id === "string" && image.id.trim()) next.push(image);
      }
      prepared.document = { ...prepared.recipe.document, title: text(prepared.recipe.document.title), images: next };
    }
    await mapPool(pictureJobs, 6, async (job) => {
      const storagePath = await uploadZipImage(supabase, accountId, files, job.file, job.folder, job.imageId);
      if (storagePath) {
        uploaded.push(storagePath);
        job.image.storagePath = storagePath;
      }
      tick();
    });
    const dated: RecipeInsert[] = [];
    const undated: RecipeInsert[] = [];
    const updates: RecipeInsert[] = [];
    for (const prepared of preparedRecipes) {
      const row: RecipeInsert = {
        id: prepared.id,
        account_id: accountId,
        title: clip(prepared.recipe.title, 200),
        leaf_category_id: prepared.leaf,
        source_path: prepared.recipe.sourcePath,
        document: prepared.document,
        sort_order: prepared.recipe.sortOrder,
        rating: prepared.recipe.rating,
      };
      if (prepared.previous) updates.push(row);
      else if (prepared.recipe.createdAt) dated.push({ ...row, created_at: prepared.recipe.createdAt });
      else undated.push(row);
    }
    for (const group of [...chunks(dated, 40), ...chunks(undated, 40)]) {
      const { error } = await supabase.from("recipes").insert(group);
      if (error) throw error;
      group.forEach(tick);
    }
    for (const group of chunks(updates, 40)) {
      const { error } = await supabase.from("recipes").upsert(group, { onConflict: "id" });
      if (error) throw error;
      group.forEach(tick);
    }
    const replacedIds = preparedRecipes.filter((recipe) => recipe.previous).map((recipe) => recipe.id);
    for (const group of chunks(replacedIds, 100)) {
      const { error } = await supabase.from("recipe_labels").delete().in("recipe_id", group);
      if (error) throw error;
    }
    const labels = preparedRecipes.flatMap((prepared) => {
      const labelIds = [...new Set(prepared.recipe.labels.map((label) => categoryIds.get(label)).filter((value): value is string => Boolean(value)))];
      if (!labelIds.includes(prepared.leaf)) labelIds.push(prepared.leaf);
      return labelIds.map((categoryId) => ({ recipe_id: prepared.id, category_id: categoryId }));
    });
    for (const group of chunks(labels, 200)) {
      const { error } = await supabase.from("recipe_labels").insert(group);
      if (error) throw error;
    }
    const stale = preparedRecipes.flatMap((prepared) => {
      if (!prepared.previous) return [];
      const kept = new Set(imagePaths(prepared.document));
      return imagePaths(prepared.previous.document).filter((path) => !kept.has(path));
    });
    for (const group of chunks(stale, 100)) {
      await supabase.storage.from("recipe-images").remove(group);
    }
    tick();
    onProgress?.(1);
  } catch {
    if (mode === "replace") {
      await supabase.from("recipe_categories").delete().eq("account_id", accountId).is("parent_id", null).neq("name", "מועדפים");
      await removeAccountImages(supabase, accountId);
    } else if (uploaded.length > 0) {
      for (let offset = 0; offset < uploaded.length; offset += 100) {
        await supabase.storage.from("recipe-images").remove(uploaded.slice(offset, offset + 100));
      }
    }
    throw new Error("לא ניתן לייבא את המתכונים");
  }
}

function parseRecipes(files: Map<string, Uint8Array>) {
  const bytes = files.get("recipes.json");
  if (!bytes) return null;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InventoryFileError();
  }
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const record = value as { categories?: unknown; recipes?: unknown };
  if (!Array.isArray(record.categories) || !Array.isArray(record.recipes)) throw new InventoryFileError();
  const categories = record.categories.map(readCategory);
  const recipes = record.recipes.map(readRecipe);
  return { categories, recipes };
}

function readCategory(value: unknown): ExportedCategory {
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  const name = text(row.name);
  if (!id || !name) throw new InventoryFileError();
  return {
    id,
    parentId: text(row.parentId) || null,
    name,
    sortOrder: numberValue(row.sortOrder),
    image: text(row.image) || null,
  };
}

function readRecipe(value: unknown): ExportedRecipe {
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  const title = text(row.title);
  const leafCategoryId = text(row.leafCategoryId);
  if (!id || !title || !leafCategoryId) throw new InventoryFileError();
  const rating = typeof row.rating === "number" && row.rating >= 1 && row.rating <= 5 ? Math.round(row.rating) : null;
  const sourcePath = text(row.sourcePath);
  return {
    id,
    title,
    leafCategoryId,
    sourcePath: sourcePath ? clip(sourcePath, 500) : null,
    sortOrder: numberValue(row.sortOrder),
    rating,
    createdAt: typeof row.createdAt === "string" && !Number.isNaN(Date.parse(row.createdAt)) ? row.createdAt : null,
    labels: Array.isArray(row.labels) ? row.labels.filter((label): label is string => typeof label === "string" && label.trim().length > 0) : [],
    document: row.document && typeof row.document === "object" ? (row.document as Record<string, unknown>) : {},
  };
}

async function uploadZipImage(supabase: Supabase, accountId: string, files: Map<string, Uint8Array>, fileName: string, folder: string, imageId?: string) {
  const name = fileName.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!name || name.split("/").includes("..") || !isRecipeImagePath(name)) throw new InventoryFileError();
  const bytes = files.get(name);
  if (!bytes || bytes.byteLength === 0) return null;
  const contentType = contentTypeFor(name);
  if (!contentType) return null;
  const id = safeName(imageId || crypto.randomUUID());
  const storagePath = `${folder}/${id}.${extension(name)}`;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const { error } = await supabase.storage.from("recipe-images").upload(storagePath, new Blob([copy], { type: contentType }), {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return storagePath.startsWith(`${accountId}/`) ? storagePath : null;
}

function imagePaths(document: unknown) {
  if (!document || typeof document !== "object" || !Array.isArray((document as { images?: unknown }).images)) return [];
  return (document as { images: unknown[] }).images.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const path = (value as { storagePath?: unknown }).storagePath;
    return typeof path === "string" && path ? [path] : [];
  });
}

function categoryPath(category: ExportedCategory, categories: ExportedCategory[]) {
  const names: string[] = [];
  let current: ExportedCategory | undefined = category;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.push(current.name);
    const parentId: string | null = current.parentId;
    current = parentId ? categories.find((item) => item.id === parentId) : undefined;
  }
  return names.reverse().join("/");
}

function depth(category: ExportedCategory, categories: ExportedCategory[]) {
  let count = 0;
  let parent = category.parentId;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    count += 1;
    parent = categories.find((item) => item.id === parent)?.parentId ?? null;
  }
  return count;
}

async function removeAccountImages(supabase: Supabase, accountId: string, onFolder?: () => void) {
  const paths = await listFiles(supabase, accountId, onFolder);
  for (let offset = 0; offset < paths.length; offset += 100) {
    await supabase.storage.from("recipe-images").remove(paths.slice(offset, offset + 100));
    onFolder?.();
  }
}

async function listFiles(supabase: Supabase, root: string, onFolder?: () => void) {
  const files: string[] = [];
  const queue = [root];
  const seen = new Set<string>();
  let active = 0;
  await new Promise<void>((resolve) => {
    const pump = () => {
      if (files.length >= 8000) {
        queue.length = 0;
      }
      while (active < 6 && queue.length > 0) {
        const folder = queue.shift() ?? "";
        if (seen.has(folder)) continue;
        seen.add(folder);
        active += 1;
        void listFolder(supabase, folder)
          .then((found) => {
            for (const entry of found) {
              if (entry.folder) queue.push(entry.path);
              else files.push(entry.path);
            }
            onFolder?.();
          })
          .finally(() => {
            active -= 1;
            if (active === 0 && queue.length === 0) resolve();
            else pump();
          });
      }
      if (active === 0 && queue.length === 0) resolve();
    };
    pump();
  });
  return files;
}

async function listFolder(supabase: Supabase, folder: string) {
  const found: { path: string; folder: boolean }[] = [];
  let offset = 0;
  for (let page = 0; page < 80; page += 1) {
    const { data, error } = await supabase.storage.from("recipe-images").list(folder, { limit: 100, offset });
    if (error) return found;
    const batch = data ?? [];
    for (const entry of batch) {
      if (!entry.name) continue;
      const path = `${folder}/${entry.name}`;
      found.push({ path, folder: entry.metadata == null });
    }
    if (batch.length < 100) break;
    offset += batch.length;
  }
  return found;
}

async function download(supabase: Supabase, path: string) {
  const cached = await readCachedImage(path);
  if (cached) return new Uint8Array(await cached.arrayBuffer());
  const blob = await within(
    supabase.storage
      .from("recipe-images")
      .download(path)
      .then(({ data, error }) => (error || !data ? null : data)),
    15000,
  );
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  void writeCachedImage(path, new Blob([bytes], { type: blob.type || "image/jpeg" }));
  return bytes;
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

async function fetchRows<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await load(from, from + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

async function mapPool<T>(values: T[], limit: number, task: (value: T) => Promise<void>) {
  if (values.length === 0) return;
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

function extension(path: string) {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  const value = match ? match[1].toLowerCase() : "jpg";
  if (value === "jpeg") return "jpg";
  if (value === "png" || value === "webp" || value === "jpg") return value;
  return "jpg";
}

function contentTypeFor(name: string) {
  const value = extension(name);
  if (value === "webp") return "image/webp";
  if (value === "png") return "image/png";
  if (value === "jpg") return "image/jpeg";
  return null;
}

function isRecipeImagePath(name: string) {
  return name.startsWith("recipes/images/") || name.startsWith("recipe-images/");
}

function safeName(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return cleaned || "image";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clip(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, max);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}
