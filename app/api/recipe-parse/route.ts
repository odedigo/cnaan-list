/** Converts pasted recipe text into ingredient or step rows with Gemini. */

import { createClient } from "@/lib/supabase/server";
import { normalizeIngredients, normalizeSteps, recipeUnits, type TokenUsage } from "@/lib/recipe-parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxText = 12000;

export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const key = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  if (!key) return Response.json({ error: "מפתח Gemini אינו מוגדר" }, { status: 503 });

  let kind: "" | "ingredients" | "steps" = "";
  let text = "";
  try {
    const body = (await request.json()) as { kind?: unknown; text?: unknown };
    kind = body.kind === "steps" ? "steps" : body.kind === "ingredients" ? "ingredients" : "";
    text = typeof body.text === "string" ? body.text.trim().slice(0, maxText) : "";
  } catch {
    return Response.json({ error: "לא ניתן לקרוא את הטקסט" }, { status: 400 });
  }
  if (!kind || !text) return Response.json({ error: "יש להדביק טקסט" }, { status: 400 });

  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(kind, text) }] }],
        generationConfig: {
          temperature: 0,
          responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: kind === "ingredients" ? ingredientSchema : stepSchema } },
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
  if (!parsed) return Response.json({ error: "Gemini לא החזיר תוצאה", usage }, { status: 502 });

  const rows = kind === "ingredients" ? normalizeIngredients(parsed) : normalizeSteps(parsed);
  if (rows.length === 0) return Response.json({ error: "לא נמצאו שורות בטקסט", usage }, { status: 422 });
  return Response.json({ rows, usage });
}

const ingredientSchema = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "boolean", description: "True when the line is only a section title." },
          name: { type: "string", description: "Product name, or the section title without a colon." },
          quantity: { type: "string", description: "Digits, a fraction like 1/2, or a range like 2-3. Empty for a heading. Use 1 when a unit is given without a number." },
          unit: { type: "string", enum: ["", ...recipeUnits], description: "Singular unit. Empty for a heading. יחידה when no unit is written." },
          note: { type: "string", description: "Preparation or size, such as קצוץ. Empty when there is none." },
        },
        required: ["heading", "name", "quantity", "unit", "note"],
      },
    },
  },
  required: ["rows"],
};

const stepSchema = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "boolean", description: "True when the line is only a section title." },
          text: { type: "string", description: "The instruction, or the section title without a colon or a leading number." },
        },
        required: ["heading", "text"],
      },
    },
  },
  required: ["rows"],
};

function prompt(kind: "ingredients" | "steps", text: string) {
  const task =
    kind === "ingredients"
      ? "Convert this Hebrew recipe ingredient text into rows. Keep the original order. A section title such as לקציצות: is a heading. Split each ingredient into name, quantity, unit, and note. Do not invent lines and do not include preparation steps."
      : "Convert this Hebrew recipe preparation text into rows. Keep the original order and wording. A section title is a heading. Remove leading step numbers. Do not invent steps and do not include an ingredient list.";
  return `${task}\nMap חצי to 1/2, רבע to 1/4, שליש to 1/3, and שני שליש to 2/3.\n\n${text}`;
}

function tokenUsage(payload: unknown): TokenUsage | null {
  const usage = (payload as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata;
  if (!usage) return null;
  const prompt = tokenCount(usage.promptTokenCount);
  const output = tokenCount(usage.candidatesTokenCount);
  const thoughts = tokenCount(usage.thoughtsTokenCount);
  const total = tokenCount(usage.totalTokenCount) || prompt + output + thoughts;
  if (total <= 0) return null;
  return { prompt, output, thoughts, total };
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
  const body = (await response.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null;
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
