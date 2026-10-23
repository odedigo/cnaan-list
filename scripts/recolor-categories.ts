import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { categoryPalette } from "../lib/colors.ts";

const usernameArg = process.argv.find((arg) => arg.startsWith("--username="))?.slice("--username=".length);

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
if (matches.length === 0) {
  console.error("No matching account. Pass --username=...");
  process.exit(1);
}

for (const profile of matches) {
  const { data: account, error: accountError } = await supabase.from("accounts").select("id").eq("owner_id", profile.id).single();
  if (accountError || !account) throw accountError ?? new Error(`Account not found for ${profile.username}`);

  const { data: categories, error: categoryError } = await supabase
    .from("categories")
    .select("id, sort_order")
    .eq("account_id", account.id)
    .order("sort_order");
  if (categoryError) throw categoryError;

  const rows = categories ?? [];
  const palette = categoryPalette(rows.length);
  for (let index = 0; index < rows.length; index += 1) {
    const { error: updateError } = await supabase.from("categories").update({ color: palette[index] }).eq("id", rows[index].id);
    if (updateError) throw updateError;
  }
  console.log(`Recolored ${rows.length} categories for ${profile.username}.`);
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
