import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { categoryPalette, nextCategoryColor } from "../lib/colors.ts";

type SourceItem = {
  name?: string;
  description?: string;
};

type SourceCategory = {
  name?: string;
  items?: SourceItem[];
};

const jsonPath = resolve(process.argv[2] ?? "");
const usernameArg = process.argv.find((arg) => arg.startsWith("--username="))?.slice("--username=".length);
const replace = process.argv.includes("--replace");

if (!jsonPath || jsonPath === resolve("")) {
  console.error("Usage: node --experimental-strip-types scripts/import-categories.ts <file.json> [--username=name] [--replace]");
  process.exit(1);
}

loadEnv(resolve(".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const source = JSON.parse(readFileSync(jsonPath, "utf8")) as { categories?: SourceCategory[] };
const categories = (source.categories ?? [])
  .map((category) => ({
    name: String(category.name ?? "").trim(),
    items: (category.items ?? [])
      .map((item) => ({
        name: String(item.name ?? "").trim(),
        comments: String(item.description ?? "").trim(),
      }))
      .filter((item) => item.name),
  }))
  .filter((category) => category.name);

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

const { data: existing, error: existingError } = await supabase
  .from("categories")
  .select("color, sort_order")
  .eq("account_id", account.id);
if (existingError) throw existingError;

if (replace) {
  const { error: deleteError } = await supabase.from("categories").delete().eq("account_id", account.id);
  if (deleteError) throw deleteError;
}

const usedColors = replace ? [] : (existing ?? []).map((category) => category.color);
const sortStart = replace ? 0 : (existing ?? []).reduce((max, category) => Math.max(max, category.sort_order), -1) + 1;
const freshPalette = usedColors.length === 0 ? categoryPalette(categories.length) : null;
const categoryRows = categories.map((category, index) => {
  const color = freshPalette ? freshPalette[index] : nextCategoryColor(usedColors);
  if (!freshPalette) usedColors.push(color);
  return {
    id: randomUUID(),
    account_id: account.id,
    name: category.name,
    color,
    sort_order: sortStart + index,
  };
});

const { error: categoryError } = await supabase.from("categories").insert(categoryRows);
if (categoryError) {
  if (categoryError.code === "23514" && categoryError.message.includes("categories_color_check")) {
    console.error("The database still only allows the six named colors. Run supabase/migrations/0002_category_colors.sql in the Supabase SQL editor, then run this script again.");
    process.exit(1);
  }
  throw categoryError;
}

const itemRows = categories.flatMap((category, categoryIndex) =>
  category.items.map((item, itemIndex) => ({
    account_id: account.id,
    category_id: categoryRows[categoryIndex].id,
    name: item.name,
    comments: item.comments,
    unit: "unit",
    quantity: 1,
    sort_order: itemIndex,
  })),
);

for (let offset = 0; offset < itemRows.length; offset += 200) {
  const { error: itemError } = await supabase.from("items").insert(itemRows.slice(offset, offset + 200));
  if (itemError) throw itemError;
}

console.log(`Imported ${categoryRows.length} categories and ${itemRows.length} items into ${owner.username}.`);

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
