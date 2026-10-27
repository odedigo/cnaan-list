/** Shapes and checks for recipe text that Gemini turns into editor rows. */

export type ParsedIngredient = {
  heading: boolean;
  name: string;
  quantity: string;
  unit: string;
  note: string;
};

export type ParsedStep = {
  heading: boolean;
  text: string;
};

export type TokenUsage = {
  prompt: number;
  output: number;
  thoughts: number;
  total: number;
};

export const recipeUnits = ["גרם", 'ק"ג', 'מ"ל', "ליטר", "כוס", "כף", "כפית", "שן", "חבילה", "שקית", "קופסה", "בקבוק", "קורט", "צרור", "חופן", "יחידה"];

const unitAliases: Record<string, string> = {
  כפות: "כף",
  כפיות: "כפית",
  כוסות: "כוס",
  קילו: 'ק"ג',
  קג: 'ק"ג',
  'ק״ג': 'ק"ג',
  'מ״ל': 'מ"ל',
  "גר'": "גרם",
  שיני: "שן",
  יחידות: "יחידה",
  קופסאות: "קופסה",
  צרורות: "צרור",
  חופנים: "חופן",
  חבילת: "חבילה",
  שקיות: "שקית",
  בקבוקים: "בקבוק",
  ליטרים: "ליטר",
};

const fractionWords: Record<string, string> = {
  חצי: "1/2",
  רבע: "1/4",
  "שלושת רבעי": "3/4",
  "שלושה רבעים": "3/4",
  שליש: "1/3",
  "שני שליש": "2/3",
};

const maxRows = 80;

export function normalizeIngredients(value: unknown): ParsedIngredient[] {
  const result: ParsedIngredient[] = [];
  for (const row of rows(value)) {
    const name = clip(row.name, 200).replace(/:$/, "");
    if (!name) continue;
    if (row.heading === true) result.push({ heading: true, name, quantity: "", unit: "", note: "" });
    else result.push({ heading: false, name, quantity: quantity(row.quantity), unit: unit(row.unit), note: clip(row.note, 200) });
  }
  return result;
}

export function normalizeSteps(value: unknown): ParsedStep[] {
  const result: ParsedStep[] = [];
  for (const row of rows(value)) {
    const text = clip(row.text || row.name, 1000).replace(/^\d+\s*[.)]\s*/, "").replace(/:$/, "");
    if (!text) continue;
    result.push({ heading: row.heading === true, text });
  }
  return result;
}

function rows(value: unknown) {
  const source = value && typeof value === "object" ? (value as { rows?: unknown }).rows : value;
  if (!Array.isArray(source)) return [];
  return source.slice(0, maxRows).flatMap((item) => (item && typeof item === "object" ? [item as Record<string, unknown>] : []));
}

function quantity(value: unknown) {
  const text = clip(value, 40);
  return fractionWords[text] ?? text;
}

function unit(value: unknown) {
  const text = clip(value, 40).replace(/[״“”]/g, '"').replace(/[׳‘’]/g, "'");
  if (!text) return "יחידה";
  const aliased = unitAliases[text] ?? text;
  return recipeUnits.includes(aliased) ? aliased : "יחידה";
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}
