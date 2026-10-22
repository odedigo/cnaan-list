import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, parse, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

type SourceItem = { name?: string; description?: string; icon?: string | null };
type SourceCategory = { name?: string; icon?: string | null; items?: SourceItem[] };
type Row = { id: string; name: string; comments?: string; image_path: string | null; sort_order: number };

const jsonPath = resolve(process.argv[2] ?? "");
const photosDir = resolve(process.argv[3] ?? "");
const usernameArg = process.argv.find((arg) => arg.startsWith("--username="))?.slice("--username=".length);

if (!process.argv[2] || !process.argv[3]) {
  console.error("Usage: node --experimental-strip-types scripts/import-images.ts <file.json> <photos-dir> [--username=name]");
  process.exit(1);
}

loadEnv(resolve(".env.local"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const photos = new Map<string, string>();
for (const fileName of readdirSync(photosDir)) {
  photos.set(parse(fileName).name.toLowerCase(), join(photosDir, fileName));
}

function photoForIcon(icon: string | null | undefined) {
  const id = String(icon ?? "").trim().toLowerCase();
  if (!id) return null;
  return photos.get(id) ?? null;
}

const source = JSON.parse(readFileSync(jsonPath, "utf8")) as { categories?: SourceCategory[] };
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, username");
if (profileError) throw profileError;
const matches = (profiles ?? []).filter((profile) => !usernameArg || profile.username.toLowerCase() === usernameArg.toLowerCase());
if (matches.length !== 1) {
  console.error(matches.length === 0 ? "No matching account. Pass --username=..." : `Several accounts found (${matches.map((profile) => profile.username).join(", ")}). Pass --username=...`);
  process.exit(1);
}
const owner = matches[0];
const { data: account, error: accountError } = await supabase.from("accounts").select("id").eq("owner_id", owner.id).single();
if (accountError || !account) throw accountError ?? new Error("Account not found");

const [{ data: categoryRows, error: categoryError }, { data: itemRows, error: itemError }] = await Promise.all([
  supabase.from("categories").select("id, name, image_path, sort_order").eq("account_id", account.id).order("sort_order"),
  supabase.from("items").select("id, category_id, name, comments, image_path, sort_order").eq("account_id", account.id).order("sort_order"),
]);
if (categoryError) throw categoryError;
if (itemError) throw itemError;

const dbCategories = new Map<string, Row>();
for (const category of categoryRows ?? []) dbCategories.set(category.name.trim(), category);
const dbItems = new Map<string, Row[]>();
for (const item of itemRows ?? []) {
  const list = dbItems.get(item.category_id) ?? [];
  list.push(item);
  dbItems.set(item.category_id, list);
}

const jobs: { kind: "categories" | "items"; id: string; filePath: string; previous: string | null }[] = [];
let skipped = 0;
for (const category of source.categories ?? []) {
  const name = String(category.name ?? "").trim();
  const dbCategory = dbCategories.get(name);
  if (!dbCategory) continue;
  const categoryPhoto = photoForIcon(category.icon);
  if (category.icon && !categoryPhoto) skipped += 1;
  if (categoryPhoto) jobs.push({ kind: "categories", id: dbCategory.id, filePath: categoryPhoto, previous: dbCategory.image_path });

  const pool = [...(dbItems.get(dbCategory.id) ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const used = new Set<string>();
  for (const item of category.items ?? []) {
    const itemName = String(item.name ?? "").trim();
    const comments = String(item.description ?? "").trim();
    const filePath = photoForIcon(item.icon);
    if (item.icon && !filePath) skipped += 1;
    if (!filePath) continue;
    const match = pool.find((row) => !used.has(row.id) && row.name.trim() === itemName && (row.comments ?? "").trim() === comments);
    if (!match) continue;
    used.add(match.id);
    jobs.push({ kind: "items", id: match.id, filePath, previous: match.image_path });
  }
}

let updated = 0;
let failed = 0;
for (const job of jobs) {
  const body = readFileSync(job.filePath);
  const extension = extname(job.filePath).toLowerCase() === ".png" ? "png" : "jpg";
  const contentType = extension === "png" ? "image/png" : "image/jpeg";
  const path = `${account.id}/${job.kind}/${job.id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("item-images").upload(path, body, { contentType, upsert: false });
  if (uploadError) {
    failed += 1;
    console.error(`Upload failed for ${job.id}: ${uploadError.message}`);
    continue;
  }
  const { error: updateError } = await supabase.from(job.kind).update({ image_path: path }).eq("id", job.id);
  if (updateError) {
    failed += 1;
    console.error(`Update failed for ${job.id}: ${updateError.message}`);
    continue;
  }
  if (job.previous) await supabase.storage.from("item-images").remove([job.previous]);
  updated += 1;
}

const categoryUpdates = jobs.filter((job) => job.kind === "categories").length;
const itemUpdates = jobs.filter((job) => job.kind === "items").length;
console.log(`Matched ${categoryUpdates} category images and ${itemUpdates} item images by icon id. Updated ${updated}. Skipped ${skipped} icons with no photo file. Failed ${failed}.`);

function loadEnv(path: string) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
