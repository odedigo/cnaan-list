/** Reads a shared link, pasted recipe text, or a photo of a recipe, and turns it into editor fields. */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { createClient } from "@/lib/supabase/server";
import { normalizeIngredients, normalizeSteps, recipeUnits, type TokenUsage } from "@/lib/recipe-parse";
import { blockedHost, facebookChannelName, facebookPostText, findHttpUrl, matchCategoryIds, pageImageUrl, pageRecipeText, pluginImageUrl, safePageUrl, type CategoryChoice, type SharedLink } from "@/lib/recipe-link";

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
  let imageType = "";
  let imageData = "";
  try {
    const body = (await request.json()) as { title?: unknown; text?: unknown; url?: unknown; textOnly?: unknown; categories?: unknown; imageType?: unknown; imageData?: unknown };
    shared = {
      title: typeof body.title === "string" ? body.title.trim().slice(0, 300) : "",
      text: typeof body.text === "string" ? body.text.trim().slice(0, maxText) : "",
      url: typeof body.url === "string" ? body.url.trim().slice(0, 1000) : "",
    };
    textOnly = body.textOnly === true;
    categories = readCategories(body.categories);
    imageType = typeof body.imageType === "string" ? body.imageType : "";
    imageData = typeof body.imageData === "string" ? body.imageData : "";
  } catch {
    return Response.json({ error: "לא ניתן לקרוא את הקישור" }, { status: 400 });
  }
  if (imageData.trim()) return recipeFromPhoto(imageType, imageData, categories, key, model);

  const emptyMessage = textOnly ? "הטקסט אינו מכיל מתכון" : "הקישור אינו מכיל מתכון";
  const pageUrl = textOnly ? null : (safePageUrl(shared.url) ?? safePageUrl(findHttpUrl(shared.text)) ?? safePageUrl(findHttpUrl(shared.title)));
  let pageText = "";
  let imageUrl = "";
  let sourceName = "";
  if (pageUrl) {
    const page = await readPage(pageUrl).catch(() => emptyPage);
    pageText = page.text;
    imageUrl = page.imageUrl;
    sourceName = page.sourceName;
  }
  const imagePromise = readDishImage(imageUrl, pageUrl);
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
  const image = await imagePromise;
  const geminiSource = typeof record.sourceText === "string" ? record.sourceText.trim().slice(0, 200) : "";
  return Response.json({
    title,
    sourceText: sourceName || geminiSource,
    sourceUrl: pageUrl?.toString() ?? (textOnly ? (safePageUrl(findHttpUrl(shared.text))?.toString() ?? "") : ""),
    notes: typeof record.notes === "string" ? record.notes.trim().slice(0, 2000) : "",
    ingredients,
    steps,
    categoryIds,
    newCategory,
    imageType: image?.mediaType ?? "",
    imageData: image?.data ?? "",
    usage,
  });
}

type PageBits = { text: string; imageUrl: string; sourceName: string };

const emptyPage: PageBits = { text: "", imageUrl: "", sourceName: "" };

async function readPage(url: URL): Promise<PageBits> {
  const target = needsFacebookResolve(url) ? await resolvePublic(url).catch(() => url) : url;
  const [caption, page] = await Promise.all([socialCaption(target).catch(() => emptyPage), readDocument(target).catch(() => emptyPage)]);
  const text = caption.text && !page.text.includes(caption.text) ? [caption.text, page.text].filter(Boolean).join("\n\n") : page.text || caption.text;
  return { text: text.slice(0, 12000), imageUrl: caption.imageUrl || page.imageUrl, sourceName: caption.sourceName };
}

async function socialCaption(url: URL): Promise<PageBits> {
  const [instagram, facebook] = await Promise.all([instagramCaption(url).catch(() => emptyPage), facebookCaption(url).catch(() => emptyPage)]);
  return {
    text: [instagram.text, facebook.text].filter(Boolean).join("\n\n"),
    imageUrl: instagram.imageUrl || facebook.imageUrl,
    sourceName: instagram.sourceName || facebook.sourceName,
  };
}

async function readDocument(url: URL): Promise<PageBits> {
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
      if (!location) return emptyPage;
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) return emptyPage;
    const type = response.headers.get("content-type") ?? "";
    if (type && !/text\/html|application\/xhtml|text\/plain|application\/json/i.test(type)) return emptyPage;
    const html = await response.text();
    const limit = isInstagram(current) ? 1_500_000 : 400_000;
    const sliced = html.slice(0, limit);
    return { text: pageRecipeText(sliced), imageUrl: httpsImage(pageImageUrl(sliced), current), sourceName: "" };
  }
  return emptyPage;
}

async function instagramCaption(url: URL): Promise<PageBits> {
  if (!isInstagram(url) || !/^\/(?:reel|p|tv)\/[^/]+/i.test(url.pathname)) return emptyPage;
  const endpoint = new URL("https://www.instagram.com/api/v1/oembed/");
  endpoint.searchParams.set("url", `${url.origin}${url.pathname}`);
  await assertPublic(endpoint);
  const response = await fetch(endpoint, {
    headers: { accept: "application/json", "user-agent": pageHeaders(endpoint)["user-agent"] },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return emptyPage;
  const body = (await response.json().catch(() => null)) as { title?: unknown; thumbnail_url?: unknown; author_name?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.replace(/\r\n/g, "\n").trim() : "";
  const thumb = typeof body?.thumbnail_url === "string" ? body.thumbnail_url.trim() : "";
  const author = typeof body?.author_name === "string" ? body.author_name : "";
  return { text: title.length >= 20 ? title.slice(0, 8000) : "", imageUrl: httpsImage(thumb), sourceName: socialSource(author, "instagram") };
}

async function facebookCaption(url: URL): Promise<PageBits> {
  if (!isFacebook(url)) return emptyPage;
  const video = await facebookPlugin(url, "video");
  if (video.text.length >= 80) return video;
  const post = await facebookPlugin(url, "post");
  if (post.text.length > video.text.length) return { text: post.text, imageUrl: post.imageUrl || video.imageUrl, sourceName: post.sourceName || video.sourceName };
  return video.text ? { ...video, sourceName: video.sourceName || post.sourceName } : { text: post.text, imageUrl: post.imageUrl || video.imageUrl, sourceName: post.sourceName || video.sourceName };
}

async function facebookPlugin(url: URL, kind: "video" | "post"): Promise<PageBits> {
  const endpoint = new URL(`https://www.facebook.com/plugins/${kind}.php`);
  endpoint.searchParams.set("href", facebookHref(url));
  endpoint.searchParams.set("show_text", "true");
  await assertPublic(endpoint);
  const response = await fetch(endpoint, {
    headers: pageHeaders(endpoint, true),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return emptyPage;
  const html = await response.text();
  const text = facebookPostText(html);
  return { text: text.length >= 20 ? text : "", imageUrl: httpsImage(pluginImageUrl(html)), sourceName: socialSource(facebookChannelName(html), "facebook") };
}

function socialSource(channel: string, service: "facebook" | "instagram") {
  const name = channel.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name || name.toLowerCase() === service) return service;
  return `${name} ${service}`;
}

async function readDishImage(value: string, page: URL | null) {
  const start = httpsImage(value);
  if (!start) return null;
  try {
    let current = new URL(start);
    for (let hop = 0; hop < 3; hop += 1) {
      await assertPublic(current);
      const headers: Record<string, string> = {
        accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*;q=0.8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      };
      if (page) headers.referer = page.href;
      const response = await fetch(current, { redirect: "manual", headers, signal: AbortSignal.timeout(12000) });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get("location");
        const next = location ? httpsImage(new URL(location, current).toString()) : "";
        if (!next) return null;
        current = new URL(next);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > 2_500_000) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 800 || bytes.byteLength > 2_500_000) return null;
      const mediaType = sniffedImageType(bytes);
      if (!mediaType) return null;
      return { mediaType, data: Buffer.from(bytes).toString("base64") };
    }
  } catch {
    return null;
  }
  return null;
}

function httpsImage(value: string, base?: URL) {
  const text = value.trim();
  if (!text) return "";
  try {
    const url = base ? new URL(text, base) : new URL(text);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    if (blockedHost(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function sniffedImageType(bytes: Uint8Array) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "";
}

function facebookHref(url: URL) {
  const next = new URL(url.href);
  next.hash = "";
  next.protocol = "https:";
  if (/(^|\.)(?:facebook|fb)\.com$/i.test(next.hostname)) next.hostname = "www.facebook.com";
  return next.toString();
}

function needsFacebookResolve(url: URL) {
  if (!isFacebook(url) || url.hostname === "fb.watch" || url.pathname.startsWith("/share/")) return isFacebook(url);
  return !/\/(reel|reels|videos|watch|posts|permalink|photo|photos|story)(?:\/|$)/i.test(url.pathname) && !url.searchParams.has("v") && !url.searchParams.has("story_fbid") && !url.searchParams.has("fbid");
}

async function resolvePublic(url: URL) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublic(current);
    const response = await fetch(current, {
      redirect: "manual",
      headers: resolveHeaders(current),
      signal: AbortSignal.timeout(12000),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      const location = response.headers.get("location");
      if (!location) return current;
      current = new URL(location, current);
      continue;
    }
    await response.body?.cancel().catch(() => undefined);
    return current;
  }
  return current;
}

function resolveHeaders(url: URL) {
  const headers = pageHeaders(url, isFacebook(url));
  if (isFacebook(url)) {
    headers["sec-fetch-site"] = "none";
    headers["sec-fetch-user"] = "?1";
  }
  return headers;
}

function pageHeaders(url: URL, desktopPlugin = false) {
  const desktop = desktopPlugin || isInstagram(url);
  const headers: Record<string, string> = {
    accept: "text/html,application/xhtml+xml",
    "accept-language": "he,en;q=0.8",
    "user-agent": desktop
      ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      : "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  };
  if (isFacebook(url) || desktopPlugin) {
    headers["sec-fetch-dest"] = "document";
    headers["sec-fetch-mode"] = "navigate";
    headers["upgrade-insecure-requests"] = "1";
  }
  return headers;
}

function isInstagram(url: URL) {
  return /(^|\.)instagram\.com$/i.test(url.hostname);
}

function isFacebook(url: URL) {
  const host = url.hostname.toLowerCase();
  return host === "fb.watch" || host === "fb.com" || host.endsWith(".fb.com") || host === "facebook.com" || host.endsWith(".facebook.com");
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

async function recipeFromPhoto(imageType: string, imageData: string, categories: CategoryChoice[], key: string, model: string) {
  const image = photoBytes(imageType, imageData);
  if (!image) return Response.json({ error: "לא ניתן לקרוא את התמונה" }, { status: 400 });
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType: image.media, data: image.data } }, { text: imagePrompt(categories) }] }],
        generationConfig: {
          temperature: 0,
          responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: recipeSchema(categories, true) } },
        },
      }),
      signal: AbortSignal.timeout(55000),
    });
  } catch {
    return Response.json({ error: "לא ניתן להתחבר ל-Gemini" }, { status: 502 });
  }
  if (!response.ok) return geminiError(response, "לא ניתן לקרוא את התמונה");
  const payload = await response.json().catch(() => null);
  const usage = tokenUsage(payload);
  const parsed = jsonText(payload);
  if (!parsed || typeof parsed !== "object") return Response.json({ error: "Gemini לא החזיר תוצאה", usage }, { status: 502 });
  const record = parsed as Record<string, unknown>;
  if (record.recipe === false) return Response.json({ error: "התמונה אינה מכילה מתכון", usage }, { status: 422 });
  const title = typeof record.title === "string" ? record.title.trim().slice(0, 200) : "";
  const ingredients = normalizeIngredients(record.ingredients ? { rows: record.ingredients } : record);
  const steps = normalizeSteps(record.steps ? { rows: record.steps } : record);
  if (!title || (ingredients.length === 0 && steps.length === 0)) return Response.json({ error: "התמונה אינה מכילה מתכון", usage }, { status: 422 });
  const categoryIds = matchCategoryIds(record.categoryNames, categories);
  const newCategory = categoryIds.length > 0 ? "" : typeof record.newCategory === "string" ? record.newCategory.trim().slice(0, 80) : "";
  return Response.json({
    title,
    sourceText: "",
    sourceUrl: "",
    notes: typeof record.notes === "string" ? record.notes.trim().slice(0, 2000) : "",
    ingredients,
    steps,
    categoryIds,
    newCategory,
    hasDishImage: record.hasDishImage === true,
    dishBox: record.hasDishImage === true ? dishBox(record.dishBox) : null,
    usage,
  });
}

function photoBytes(type: string, data: string) {
  const media = type === "image/jpg" ? "image/jpeg" : type.trim().toLowerCase();
  if (media !== "image/jpeg" && media !== "image/png" && media !== "image/webp") return null;
  const cleaned = data.replace(/\s/g, "");
  if (!cleaned || cleaned.length > 3_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) return null;
  const bytes = Buffer.from(cleaned, "base64");
  if (bytes.byteLength < 800 || bytes.byteLength > 2_500_000) return null;
  if (sniffedImageType(bytes) !== media) return null;
  return { media, data: cleaned };
}

function dishBox(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const ymin = Number(record.ymin);
  const xmin = Number(record.xmin);
  const ymax = Number(record.ymax);
  const xmax = Number(record.xmax);
  if (![ymin, xmin, ymax, xmax].every((item) => Number.isFinite(item))) return null;
  const top = Math.min(1000, Math.max(0, Math.min(ymin, ymax)));
  const bottom = Math.min(1000, Math.max(0, Math.max(ymin, ymax)));
  const left = Math.min(1000, Math.max(0, Math.min(xmin, xmax)));
  const right = Math.min(1000, Math.max(0, Math.max(xmin, xmax)));
  if (bottom - top < 80 || right - left < 80) return null;
  return { ymin: top, xmin: left, ymax: bottom, xmax: right };
}

function imagePrompt(categories: CategoryChoice[]) {
  const names = categories.map((category) => (category.parentName ? `${category.parentName} / ${category.name}` : category.name));
  const list = names.length > 0 ? names.map((name) => `- ${name}`).join("\n") : "- (none)";
  return `Extract one recipe from this photo or screenshot.
If it is not a recipe, set recipe to false and leave the other fields empty.
Keep the original wording and order. Do not invent ingredients, steps, or comments.
A section title is a heading. Remove leading step numbers.
Map חצי to 1/2, רבע to 1/4, שליש to 1/3, and שני שליש to 2/3.
Put servings, time, and extra remarks in notes.
Leave sourceText empty.
categoryNames must be copied from this list when one or more fit. Prefer the most specific. If none fit, leave categoryNames empty and set newCategory to a short Hebrew category name. Otherwise newCategory is empty.
If the image contains a photograph of the finished dish, set hasDishImage to true and dishBox to that photograph only. Coordinates are 0 to 1000: ymin, xmin, ymax, xmax.
Do not include the title, the ingredient list, logos, or hands holding a phone in the box.
If the dish photograph fills the image, set dishBox to 0, 0, 1000, 1000.
If there is no dish photograph, set hasDishImage to false and every dishBox value to 0.

Categories:
${list}`;
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

function recipeSchema(categories: CategoryChoice[], withDish = false) {
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
      ...(withDish
        ? {
            hasDishImage: { type: "boolean" },
            dishBox: {
              type: "object",
              properties: {
                ymin: { type: "number" },
                xmin: { type: "number" },
                ymax: { type: "number" },
                xmax: { type: "number" },
              },
              required: ["ymin", "xmin", "ymax", "xmax"],
            },
          }
        : {}),
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
    required: ["recipe", "title", "sourceText", "notes", "categoryNames", "newCategory", "ingredients", "steps", ...(withDish ? ["hasDishImage", "dishBox"] : [])],
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

async function geminiError(response: Response, fallback = "לא ניתן להמיר את הטקסט") {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  const message = body?.error?.message ?? "";
  if (response.status === 401 || response.status === 403) return Response.json({ error: "מפתח Gemini אינו תקין" }, { status: 503 });
  if (response.status === 429 || /quota|rate/i.test(message)) return Response.json({ error: "חריגה ממכסת Gemini" }, { status: 429 });
  return Response.json({ error: fallback }, { status: 502 });
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "יש להתחבר" }, { status: 401 });
  return null;
}
