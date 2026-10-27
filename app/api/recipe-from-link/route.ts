/** Reads a shared link, or pasted recipe text, and turns a recipe in it into editor fields. */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { createClient } from "@/lib/supabase/server";
import { normalizeIngredients, normalizeSteps, recipeUnits, type TokenUsage } from "@/lib/recipe-parse";
import { blockedHost, findHttpUrl, matchCategoryIds, pageRecipeText, safePageUrl, type CategoryChoice, type SharedLink } from "@/lib/recipe-link";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxText = 12000;

export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const key = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  if (!key) return Response.json({ error: "מפתח Gemini אינו מוגדר" }, { status: 503 });

  let shared: SharedLink = { title: "", text: "", url: "" };
  let categories: CategoryChoice[] = [];
  let textOnly = false;
  try {
    const body = (await request.json()) as { title?: unknown; text?: unknown; url?: unknown; textOnly?: unknown; categories?: unknown };
    shared = {
      title: typeof body.title === "string" ? body.title.trim().slice(0, 300) : "",
      text: typeof body.text === "string" ? body.text.trim().slice(0, maxText) : "",
      url: typeof body.url === "string" ? body.url.trim().slice(0, 1000) : "",
    };
    textOnly = body.textOnly === true;
    categories = readCategories(body.categories);
  } catch {
    return Response.json({ error: "לא ניתן לקרוא את הקישור" }, { status: 400 });
  }

  const emptyMessage = textOnly ? "הטקסט אינו מכיל מתכון" : "הקישור אינו מכיל מתכון";
  const pageUrl = textOnly ? null : (safePageUrl(shared.url) ?? safePageUrl(findHttpUrl(shared.text)) ?? safePageUrl(findHttpUrl(shared.title)));
  let pageText = "";
  if (pageUrl) {
    pageText = await readPage(pageUrl).catch(() => "");
  }
  const material = (textOnly ? shared.text : [shared.title, shared.text, pageText].filter(Boolean).join("\n\n")).slice(0, maxText);
  if (!material) return Response.json({ error: textOnly ? "הדביקו טקסט של מתכון" : "לא ניתן לקרוא את הקישור" }, { status: 422 });

  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(material, categories, textOnly) }] }],
        generationConfig: {
          temperature: 0,
          responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: recipeSchema(categories) } },
        },
      }),
      signal: AbortSignal.timeout(55000),
    });
  } catch {
    return Response.json({ error: "לא ניתן להתחבר ל-Gemini" }, { status: 502 });
  }

  if (!response.ok) return geminiError(response);
  const payload = await response.json().catch(() => null);
  const usage = tokenUsage(payload);
  const parsed = jsonText(payload);
  if (!parsed || typeof parsed !== "object") return Response.json({ error: "Gemini לא החזיר תוצאה", usage }, { status: 502 });

  const record = parsed as Record<string, unknown>;
  if (record.recipe === false) return Response.json({ error: emptyMessage, usage }, { status: 422 });
  const title = typeof record.title === "string" ? record.title.trim().slice(0, 200) : "";
  const ingredients = normalizeIngredients(record.ingredients ? { rows: record.ingredients } : record);
  const steps = normalizeSteps(record.steps ? { rows: record.steps } : record);
  if (!title || (ingredients.length === 0 && steps.length === 0)) return Response.json({ error: emptyMessage, usage }, { status: 422 });

  const categoryIds = matchCategoryIds(record.categoryNames, categories);
  const newCategory = categoryIds.length > 0 ? "" : typeof record.newCategory === "string" ? record.newCategory.trim().slice(0, 80) : "";
  return Response.json({
    title,
    sourceText: typeof record.sourceText === "string" ? record.sourceText.trim().slice(0, 200) : "",
    sourceUrl: pageUrl?.toString() ?? (textOnly ? (safePageUrl(findHttpUrl(shared.text))?.toString() ?? "") : ""),
    notes: typeof record.notes === "string" ? record.notes.trim().slice(0, 2000) : "",
    ingredients,
    steps,
    categoryIds,
    newCategory,
    usage,
  });
}

async function readPage(url: URL) {
  const [caption, pageText] = await Promise.all([instagramCaption(url).catch(() => ""), readDocument(url).catch(() => "")]);
  if (caption && !pageText.includes(caption)) return [caption, pageText].filter(Boolean).join("\n\n").slice(0, 12000);
  return pageText;
}

async function readDocument(url: URL) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublic(current);
    const response = await fetch(current, {
      redirect: "manual",
      headers: pageHeaders(current),
      signal: AbortSignal.timeout(12000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return "";
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) return "";
    const type = response.headers.get("content-type") ?? "";
    if (type && !/text\/html|application\/xhtml|text\/plain|application\/json/i.test(type)) return "";
    const html = await response.text();
    const limit = isInstagram(current) ? 1_500_000 : 400_000;
    return pageRecipeText(html.slice(0, limit));
  }
  return "";
}

async function instagramCaption(url: URL) {
  if (!isInstagram(url) || !/^\/(?:reel|p|tv)\/[^/]+/i.test(url.pathname)) return "";
  const endpoint = new URL("https://www.instagram.com/api/v1/oembed/");
  endpoint.searchParams.set("url", `${url.origin}${url.pathname}`);
  await assertPublic(endpoint);
  const response = await fetch(endpoint, {
    headers: { accept: "application/json", "user-agent": pageHeaders(endpoint)["user-agent"] },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return "";
  const body = (await response.json().catch(() => null)) as { title?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.replace(/\r\n/g, "\n").trim() : "";
  return title.length >= 20 ? title.slice(0, 8000) : "";
}

function pageHeaders(url: URL) {
  const desktop = isInstagram(url);
  return {
    accept: "text/html,application/xhtml+xml",
    "accept-language": "he,en;q=0.8",
    "user-agent": desktop
      ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      : "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  };
}

function isInstagram(url: URL) {
  return /(^|\.)instagram\.com$/i.test(url.hostname);
}

async function assertPublic(url: URL) {
  if (blockedHost(url.hostname)) throw new Error("blocked");
  if (isIP(url.hostname)) return;
  const records = await lookup(url.hostname, { all: true });
  if (records.length === 0 || records.some((record) => blockedHost(record.address))) throw new Error("blocked");
}

function readCategories(value: unknown): CategoryChoice[] {
  if (!Array.isArray(value)) return [];
  const choices: CategoryChoice[] = [];
  for (const item of value.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const record = item as { id?: unknown; name?: unknown; parentName?: unknown };
    const id = typeof record.id === "string" ? record.id : "";
    const name = typeof record.name === "string" ? record.name.trim().slice(0, 80) : "";
    const parentName = typeof record.parentName === "string" ? record.parentName.trim().slice(0, 80) : "";
    if (id && name) choices.push({ id, name, parentName });
  }
  return choices;
}

function prompt(material: string, categories: CategoryChoice[], textOnly: boolean) {
  const names = categories.map((category) => (category.parentName ? `${category.parentName} / ${category.name}` : category.name));
  const list = names.length > 0 ? names.map((name) => `- ${name}`).join("\n") : "- (none)";
  const source = textOnly
    ? "Extract one recipe from this pasted recipe text."
    : "Extract one recipe from this social post or web page. The text may include a caption, a description, comments, and the page itself.";
  return `${source}
If it is not a recipe, set recipe to false and leave the other fields empty.
Keep the original wording and order. Do not invent ingredients, steps, or comments.
A section title is a heading. Remove leading step numbers.
Map חצי to 1/2, רבע to 1/4, שליש to 1/3, and שני שליש to 2/3.
Put servings, time, and extra remarks in notes.
sourceText is a short source name, such as the site or account, and not the recipe title.
categoryNames must be copied from this list when one or more fit. Prefer the most specific. If none fit, leave categoryNames empty and set newCategory to a short Hebrew category name. Otherwise newCategory is empty.

Categories:
${list}

${material}`;
}

function recipeSchema(categories: CategoryChoice[]) {
  const names = [...new Set(categories.map((category) => (category.parentName ? `${category.parentName} / ${category.name}` : category.name)))];
  return {
    type: "object",
    properties: {
      recipe: { type: "boolean" },
      title: { type: "string" },
      sourceText: { type: "string" },
      notes: { type: "string" },
      categoryNames: { type: "array", items: names.length > 0 ? { type: "string", enum: names } : { type: "string" } },
      newCategory: { type: "string" },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "boolean" },
            name: { type: "string" },
            quantity: { type: "string" },
            unit: { type: "string", enum: ["", ...recipeUnits] },
            note: { type: "string" },
          },
          required: ["heading", "name", "quantity", "unit", "note"],
        },
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "boolean" },
            text: { type: "string" },
          },
          required: ["heading", "text"],
        },
      },
    },
    required: ["recipe", "title", "sourceText", "notes", "categoryNames", "newCategory", "ingredients", "steps"],
  };
}

function tokenUsage(payload: unknown): TokenUsage | null {
  const usage = (payload as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata;
  if (!usage) return null;
  const promptCount = tokenCount(usage.promptTokenCount);
  const output = tokenCount(usage.candidatesTokenCount);
  const thoughts = tokenCount(usage.thoughtsTokenCount);
  const total = tokenCount(usage.totalTokenCount) || promptCount + output + thoughts;
  if (total <= 0) return null;
  return { prompt: promptCount, output, thoughts, total };
}

function tokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function jsonText(payload: unknown) {
  const body = payload as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(fenced) as unknown;
  } catch {
    return null;
  }
}

async function geminiError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  const message = body?.error?.message ?? "";
  if (response.status === 401 || response.status === 403) return Response.json({ error: "מפתח Gemini אינו תקין" }, { status: 503 });
  if (response.status === 429 || /quota|rate/i.test(message)) return Response.json({ error: "חריגה ממכסת Gemini" }, { status: 429 });
  return Response.json({ error: "לא ניתן להמיר את הטקסט" }, { status: 502 });
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "יש להתחבר" }, { status: 401 });
  return null;
}
