/** Shared-link payload, public page text, and the recipe import shape. */

import type { ParsedIngredient, ParsedStep } from "@/lib/recipe-parse";

export const shareCookie = "cnaanlist-share";

export type SharedLink = {
  title: string;
  text: string;
  url: string;
};

export type CategoryChoice = {
  id: string;
  name: string;
  parentName: string;
};

export type ImportedRecipe = {
  title: string;
  sourceText: string;
  sourceUrl: string;
  notes: string;
  ingredients: ParsedIngredient[];
  steps: ParsedStep[];
  categoryIds: string[];
  newCategory: string;
};

export function clipShare(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

export function sharePayload(title: string, text: string, url: string) {
  let body: SharedLink = { title: clipShare(title, 300), text: clipShare(text, 2500), url: clipShare(url, 1000) };
  let raw = JSON.stringify(body);
  while (raw.length > 3500 && body.text.length > 0) {
    body = { ...body, text: body.text.slice(0, Math.floor(body.text.length * 0.8)) };
    raw = JSON.stringify(body);
  }
  return raw;
}

export function readSharePayload(raw: string): SharedLink | null {
  try {
    const body = JSON.parse(raw) as Partial<SharedLink>;
    const title = clipShare(body.title, 300);
    const text = clipShare(body.text, 2500);
    const url = clipShare(body.url, 1000);
    if (!title && !text && !url) return null;
    return { title, text, url };
  } catch {
    return null;
  }
}

export function findHttpUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return "";
  return match[0].replace(/[),.;]+$/g, "");
}

export function safePageUrl(value: string) {
  const text = value.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (blockedHost(url.hostname)) return null;
  return url;
}

export function blockedHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  const mapped = host.startsWith("::ffff:") ? host.slice(7) : host;
  const parts = mapped.split(".").map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first, second] = parts;
    if (first === 0 || first === 10 || first === 127) return true;
    if (first === 169 && second === 254) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;
  }
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

export function pageRecipeText(html: string) {
  const structured = recipeBlocks(html);
  const title = metaContent(html, "og:title") || tagText(html, "title");
  const description = metaContent(html, "og:description") || metaContent(html, "description");
  const caption = embeddedCaption(html);
  const descriptionText = caption && (caption.includes(description) || description.includes(caption)) ? "" : description;
  const extra = [title, descriptionText, caption].filter((part) => part && !structured.includes(part));
  const joined = [structured, ...extra].filter(Boolean).join("\n\n");
  if (caption.length >= 80 || joined.length >= 400) return joined.slice(0, 12000);
  const visible = visibleText(html).slice(0, 6000);
  return [joined, visible].filter(Boolean).join("\n\n").slice(0, 12000);
}

export function matchCategoryIds(names: unknown, categories: CategoryChoice[]) {
  const wanted = Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : [];
  const ids: string[] = [];
  for (const name of wanted) {
    const key = normalizeName(name);
    const found = categories.find((category) => {
      const own = normalizeName(category.name);
      const path = normalizeName(category.parentName ? `${category.parentName} / ${category.name}` : category.name);
      return key === own || key === path || key.endsWith(` / ${own}`);
    });
    if (found && !ids.includes(found.id)) ids.push(found.id);
  }
  return ids;
}

function recipeBlocks(html: string) {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const lines: string[] = [];
  for (const block of blocks) {
    try {
      collectRecipes(JSON.parse(decode(block[1])), lines);
    } catch {
      continue;
    }
  }
  return lines.join("\n").slice(0, 8000);
}

function collectRecipes(value: unknown, lines: string[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectRecipes(item, lines);
    return;
  }
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => String(item).toLowerCase() === "recipe")) lines.push(formatRecipe(record));
  if (Array.isArray(record["@graph"])) collectRecipes(record["@graph"], lines);
}

function formatRecipe(record: Record<string, unknown>) {
  const lines = [textOf(record.name) && `שם: ${textOf(record.name)}`, textOf(record.description) && `תיאור: ${textOf(record.description)}`].filter(Boolean);
  const ingredients = listOf(record.recipeIngredient);
  if (ingredients.length > 0) lines.push("מצרכים:", ...ingredients.map((line) => `- ${line}`));
  const steps = stepsOf(record.recipeInstructions);
  if (steps.length > 0) lines.push("הכנה:", ...steps.map((line, index) => `${index + 1}. ${line}`));
  return lines.join("\n");
}

function stepsOf(value: unknown): string[] {
  if (typeof value === "string") return [cleanLine(value)].filter(Boolean);
  if (!Array.isArray(value)) {
    if (value && typeof value === "object") return stepsOf((value as { text?: unknown; itemListElement?: unknown }).itemListElement ?? (value as { text?: unknown }).text);
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string") return [cleanLine(item)].filter(Boolean);
    if (!item || typeof item !== "object") return [];
    const record = item as { text?: unknown; name?: unknown; itemListElement?: unknown };
    const text = textOf(record.text) || textOf(record.name);
    return [...(text ? [text] : []), ...stepsOf(record.itemListElement)];
  });
}

function listOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanLine(typeof item === "string" ? item : "")).filter(Boolean);
}

function textOf(value: unknown) {
  return typeof value === "string" ? cleanLine(value) : "";
}

function metaContent(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanLine(decode(match[1]));
  }
  return "";
}

function tagText(html: string, tag: string) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1] ? cleanLine(decode(match[1].replace(/<[^>]+>/g, " "))) : "";
}

/** Caption text embedded in a public page script, such as an Instagram reel. */
function embeddedCaption(html: string) {
  let best = "";
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1] ?? "";
    if (!/caption/i.test(raw)) continue;
    const versions = raw.includes('\\"') ? [raw, raw.replace(/\\+"/g, '"').replace(/\\\\/g, "\\")] : [raw];
    for (const body of versions) {
      const text = captionNear(body);
      if (text.length > best.length) best = text;
    }
  }
  return best.slice(0, 8000);
}

function captionNear(body: string) {
  let best = "";
  for (const key of ['"edge_media_to_caption"', '"caption"']) {
    let from = 0;
    while (from < body.length) {
      const at = body.indexOf(key, from);
      if (at < 0) break;
      const text = firstText(body.slice(at + key.length, at + key.length + 8000));
      if (text.length > best.length) best = text;
      from = at + key.length;
    }
  }
  return best.length >= 20 ? best : "";
}

function firstText(source: string) {
  const at = source.indexOf('"text"');
  if (at < 0) return "";
  const quote = source.indexOf('"', at + 6);
  if (quote < 0) return "";
  return captionBlock(readJsonString(source, quote));
}

function readJsonString(source: string, start: number) {
  if (source[start] !== '"') return "";
  let out = "";
  for (let i = start + 1; i < source.length && out.length < 8000; i += 1) {
    const char = source[i];
    if (char === "\\") {
      const next = source[i + 1] ?? "";
      if (next === "u" && /^[0-9a-fA-F]{4}/.test(source.slice(i + 2, i + 6))) {
        out += String.fromCharCode(Number.parseInt(source.slice(i + 2, i + 6), 16));
        i += 5;
        continue;
      }
      const escaped: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\", "/": "/" };
      out += escaped[next] ?? next;
      i += 1;
      continue;
    }
    if (char === '"') return out;
    out += char;
  }
  return "";
}

function captionBlock(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function visibleText(html: string) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return cleanLine(decode(stripped));
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decode(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'");
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/[״"]/g, '"').replace(/[׳']/g, "'");
}
