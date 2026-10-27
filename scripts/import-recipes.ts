import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type DirNode = {
  name: string;
  abs: string;
  dirs: DirNode[];
  files: string[];
};

type CategoryRow = {
  id: string;
  name: string;
  parentKey: string | null;
  key: string;
  sort_order: number;
};

type SourceImage = {
  id?: string;
  mediaType?: string;
  placement?: string;
  widthPx?: number;
  heightPx?: number;
  description?: string;
  blob?: string;
};

const rootArg = resolve(process.argv[2] ?? "");
const usernameArg = process.argv.find((arg) => arg.startsWith("--username="))?.slice("--username=".length);
const replace = process.argv.includes("--replace");

if (!rootArg || rootArg === resolve("")) {
  console.error('Usage: node --experimental-strip-types scripts/import-recipes.ts <folder> [--username=name] [--replace]');
  process.exit(1);
}

loadEnv(resolve(".env.local"));

const production = process.env.PRODUCTION === "true";
const url = production ? process.env.NEXT_PUBLIC_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL_DEV;
const serviceKey = production ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY_DEV;
if (!url || !serviceKey) {
  console.error("Missing the Supabase URL or service role key for this PRODUCTION setting in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, username");
if (profileError) throw profileError;
const matches = (profiles ?? []).filter((profile) => !usernameArg || profile.username.toLowerCase() === usernameArg.toLowerCase());
if (matches.length !== 1) {
  console.error(
    matches.length === 0
      ? "No matching account. Pass --username=..."
      : `Several accounts found (${matches.map((profile) => profile.username).join(", ")}). Pass --username=...`,
  );
  process.exit(1);
}

const owner = matches[0];
const { data: account, error: accountError } = await supabase.from("accounts").select("id").eq("owner_id", owner.id).single();
if (accountError || !account) throw accountError ?? new Error("Account not found");

const tree = readTree(rootArg);
const wanted = collectCategories(tree);
const categories = await ensureCategories(supabase, account.id, wanted, replace);
const files = collectFiles(rootArg, tree);
let imported = 0;
let images = 0;

for (const file of files) {
  const sourcePath = file.sourcePath;
  const leaf = categories.get(file.categoryKey);
  if (!leaf) {
    console.error(`No category for ${sourcePath}`);
    continue;
  }
  const raw = JSON.parse(readFileSync(file.absolute, "utf8")) as Record<string, unknown>;
  const title = clip(String(raw.title ?? "").trim() || file.name, 200);
  const { data: existing, error: existingError } = await supabase
    .from("recipes")
    .select("id")
    .eq("account_id", account.id)
    .eq("source_path", sourcePath)
    .maybeSingle();
  if (existingError) throw existingError;
  const recipeId = existing?.id ?? randomUUID();
  await removeFolder(supabase, `${account.id}/${recipeId}`);
  const storedImages = [];
  const sourceImages = Array.isArray(raw.images) ? (raw.images as SourceImage[]) : [];
  for (let index = 0; index < sourceImages.length; index += 1) {
    const image = sourceImages[index];
    const imageId = clip(String(image.id ?? `image-${index + 1}`).trim() || `image-${index + 1}`, 80);
    const mediaType = String(image.mediaType ?? "image/jpeg");
    const extension = extensionFor(mediaType);
    const next: Record<string, unknown> = {
      id: imageId,
      mediaType,
    };
    if (image.placement) next.placement = image.placement;
    if (typeof image.widthPx === "number") next.widthPx = image.widthPx;
    if (typeof image.heightPx === "number") next.heightPx = image.heightPx;
    if (image.description) next.description = image.description;
    if (image.blob && extension) {
      const storagePath = `${account.id}/${recipeId}/${imageId}.${extension}`;
      const body = Buffer.from(image.blob, "base64");
      const { error: uploadError } = await supabase.storage.from("recipe-images").upload(storagePath, body, {
        contentType: mediaType === "image/jpg" ? "image/jpeg" : mediaType,
        upsert: true,
      });
      if (uploadError) throw uploadError;
      next.storagePath = storagePath;
      images += 1;
    }
    storedImages.push(next);
  }
  const document = {
    title,
    source: raw.source ?? null,
    credits: raw.credits ?? [],
    ingredients: raw.ingredients ?? [],
    steps: raw.steps ?? [],
    notes: raw.notes ?? [],
    images: storedImages,
    content: raw.content ?? [],
  };
  const row = {
    id: recipeId,
    account_id: account.id,
    title,
    leaf_category_id: leaf,
    source_path: sourcePath,
    document,
    sort_order: file.sortOrder,
  };
  const { error: saveError } = existing
    ? await supabase.from("recipes").update(row).eq("id", recipeId)
    : await supabase.from("recipes").insert(row);
  if (saveError) throw saveError;
  const labelIds = labelKeys(file.categoryKey).map((key) => categories.get(key)).filter((id): id is string => Boolean(id));
  const { error: deleteLabelsError } = await supabase.from("recipe_labels").delete().eq("recipe_id", recipeId);
  if (deleteLabelsError) throw deleteLabelsError;
  const { error: labelError } = await supabase.from("recipe_labels").insert(labelIds.map((categoryId) => ({ recipe_id: recipeId, category_id: categoryId })));
  if (labelError) throw labelError;
  imported += 1;
  if (imported % 25 === 0 || imported === files.length) console.log(`${imported}/${files.length} ${sourcePath}`);
}

console.log(`Imported ${imported} recipes and ${images} images into ${owner.username}.`);

function readTree(dir: string): DirNode {
  const entries = readdirSync(dir, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => readTree(join(dir, entry.name)))
    .filter((entry) => entry.name)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "he"));
  return { name: dir.split(sep).pop()?.trim() ?? "", abs: dir, dirs, files };
}

function collectCategories(node: DirNode, parentKey: string | null = null, acc: CategoryRow[] = []) {
  node.dirs.forEach((dir, index) => {
    const key = parentKey ? `${parentKey}/${dir.name}` : dir.name;
    acc.push({ id: randomUUID(), name: clip(dir.name, 120), parentKey, key, sort_order: index });
    collectCategories(dir, key, acc);
  });
  return acc;
}

function collectFiles(root: string, node: DirNode, categoryKey: string | null = null, acc: { absolute: string; sourcePath: string; categoryKey: string; name: string; sortOrder: number }[] = []) {
  if (categoryKey) {
    node.files.forEach((name, index) => {
      const absolute = join(node.abs, name);
      acc.push({
        absolute,
        sourcePath: relative(root, absolute).split(sep).join("/"),
        categoryKey,
        name: name.replace(/\.json$/i, ""),
        sortOrder: index,
      });
    });
  } else if (node.files.length > 0) {
    console.error(`Skipping ${node.files.length} JSON files in the root folder. A recipe needs a category folder.`);
  }
  for (const dir of node.dirs) {
    const key = categoryKey ? `${categoryKey}/${dir.name}` : dir.name;
    collectFiles(root, dir, key, acc);
  }
  return acc;
}

async function ensureCategories(client: SupabaseClient, accountId: string, wanted: CategoryRow[], wipe: boolean) {
  if (wipe) {
    await removeFolder(client, accountId);
    const { error } = await client.from("recipe_categories").delete().eq("account_id", accountId).neq("name", "מועדפים");
    if (error) throw error;
  }
  const { data: existing, error } = await client.from("recipe_categories").select("id, parent_id, name").eq("account_id", accountId);
  if (error) throw error;
  const byId = new Map((existing ?? []).map((row) => [row.id, row]));
  const byKey = new Map<string, string>();
  for (const row of existing ?? []) {
    const names: string[] = [];
    let current: { id: string; parent_id: string | null; name: string } | undefined = row;
    while (current) {
      names.push(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    byKey.set(names.reverse().join("/"), row.id);
  }
  for (const category of wanted) {
    const found = byKey.get(category.key);
    if (found) {
      category.id = found;
      continue;
    }
    const parentId = category.parentKey ? byKey.get(category.parentKey) ?? null : null;
    if (category.parentKey && !parentId) throw new Error(`Missing parent for ${category.key}`);
    const { error: insertError } = await client.from("recipe_categories").insert({
      id: category.id,
      account_id: accountId,
      parent_id: parentId,
      name: category.name,
      sort_order: category.sort_order,
    });
    if (insertError) throw insertError;
    byKey.set(category.key, category.id);
  }
  return byKey;
}

function labelKeys(categoryKey: string) {
  const parts = categoryKey.split("/");
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function extensionFor(mediaType: string) {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/jpeg" || mediaType === "image/jpg") return "jpg";
  return null;
}

async function removeFolder(client: SupabaseClient, prefix: string) {
  const entries = await listFolder(client, prefix);
  const files: string[] = [];
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id) files.push(path);
    else await removeFolder(client, path);
  }
  for (let offset = 0; offset < files.length; offset += 100) {
    const { error } = await client.storage.from("recipe-images").remove(files.slice(offset, offset + 100));
    if (error) throw error;
  }
}

async function listFolder(client: SupabaseClient, prefix: string) {
  const rows: { name: string; id: string | null }[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from("recipe-images").list(prefix, { limit: 100, offset });
    if (error) throw error;
    rows.push(...(data ?? []).map((entry) => ({ name: entry.name, id: entry.id })));
    if (!data || data.length < 100) break;
  }
  return rows;
}

function clip(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, max);
}

function loadEnv(path: string) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
