/** Recipe JSON shape, Hebrew display, and the text export. */

export type RecipeSource = {
  text: string;
  url: string | null;
  linkLabel: string | null;
} | null;

export type RecipeIngredient = {
  text: string;
  quantity: string | null;
  unit: string | null;
  product: string | null;
  note: string | null;
};

export type RecipeStep = {
  number: number;
  text: string;
  level?: number;
};

export type RecipeImage = {
  id: string;
  mediaType: string;
  placement?: string;
  widthPx?: number;
  heightPx?: number;
  description?: string;
  storagePath?: string;
};

export type RecipeDocument = {
  title: string;
  source: RecipeSource;
  credits: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  notes: string[];
  images: RecipeImage[];
  content: unknown[];
};

const months = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

const fractions: Record<string, string> = {
  "1/2": "½",
  "1/3": "⅓",
  "2/3": "⅔",
  "1/4": "¼",
  "3/4": "¾",
  "1/5": "⅕",
  "1/6": "⅙",
  "1/8": "⅛",
  "3/8": "⅜",
  "5/8": "⅝",
  "7/8": "⅞",
};

export function emptyDocument(title: string): RecipeDocument {
  return {
    title,
    source: null,
    credits: [],
    ingredients: [],
    steps: [],
    notes: [],
    images: [],
    content: [],
  };
}

export function parseDocument(value: unknown, fallbackTitle = ""): RecipeDocument {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const title = stringValue(raw.title) || fallbackTitle;
  return {
    title,
    source: parseSource(raw.source),
    credits: stringList(raw.credits),
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.map(parseIngredient) : [],
    steps: Array.isArray(raw.steps) ? raw.steps.map(parseStep) : [],
    notes: stringList(raw.notes),
    images: Array.isArray(raw.images) ? raw.images.map(parseImage).filter((image) => image.id) : [],
    content: Array.isArray(raw.content) ? raw.content : [],
  };
}

export function isSectionHeader(ingredient: RecipeIngredient) {
  return !clean(ingredient.quantity) && !clean(ingredient.unit);
}

export function isSubtitle(text: string) {
  return text.trim().endsWith(":");
}

export function ingredientName(ingredient: RecipeIngredient) {
  return clean(ingredient.product) || clean(ingredient.text) || "";
}

export function formatAmount(quantity: string | null, unit: string | null) {
  const qty = clean(quantity);
  if (!qty) return "";
  return [formatQuantityToken(qty), clean(unit) || "יחידה"].join(" ");
}

export function formatQuantityToken(quantity: string) {
  const trimmed = quantity.trim().replace(/\s+/g, " ");
  const mixed = trimmed.match(/^(\d+)\s+(\d+\/\d+)$/);
  if (mixed) {
    const fraction = fractions[mixed[2]];
    return fraction ? `${mixed[1]}${fraction}` : trimmed;
  }
  return fractions[trimmed] ?? trimmed;
}

export function formatHebrewDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`;
}

export function visibleImages(images: RecipeImage[]) {
  return images.filter((image) => {
    if (!image.storagePath) return false;
    const width = image.widthPx ?? 0;
    const height = image.heightPx ?? 0;
    return !(width > 0 && height > 0 && width < 64 && height < 64);
  });
}

export function recipeExportText(input: {
  title: string;
  rating: number | null;
  createdAt: string;
  document: RecipeDocument;
}) {
  const { document } = input;
  const lines: string[] = [input.title.trim() || document.title.trim() || "מתכון", ""];
  if (input.rating) lines.push(`דירוג: ${input.rating}/5`, "");
  const source = document.source?.text?.trim();
  if (source) lines.push(`מקור: ${source}`);
  if (document.source?.url) lines.push(document.source.url);
  const date = formatHebrewDate(input.createdAt);
  if (date) lines.push(`תאריך הוספה: ${date}`);
  const comments = [...document.credits, ...document.notes].map((line) => line.trim()).filter(Boolean).join("\n");
  if (comments) lines.push("", "הערות", comments);
  lines.push("", "מצרכים");
  if (document.ingredients.length === 0) lines.push("");
  for (const ingredient of document.ingredients) {
    const name = ingredientName(ingredient);
    const amount = formatAmount(ingredient.quantity, ingredient.unit);
    if (isSectionHeader(ingredient)) lines.push(name);
    else lines.push(amount ? `${name} — ${amount}` : name);
  }
  lines.push("", "הכנה");
  if (document.steps.length === 0) lines.push("");
  let stepNumber = 0;
  for (const step of document.steps) {
    if (isSubtitle(step.text)) lines.push(step.text);
    else {
      stepNumber += 1;
      lines.push(`${stepNumber}. ${step.text}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function downloadRecipeFile(title: string, text: string) {
  const blob = new Blob([`\uFEFF${text}`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName(title)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

export function renumberSteps(steps: RecipeStep[]) {
  return steps.map((step, index) => ({ ...step, number: index + 1 }));
}

function fileName(title: string) {
  const cleaned = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").trim();
  return cleaned || "מתכון";
}

function parseSource(value: unknown): RecipeSource {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const text = stringValue(raw.text);
  const url = stringValue(raw.url) || null;
  const linkLabel = stringValue(raw.linkLabel) || null;
  if (!text && !url && !linkLabel) return null;
  return { text, url, linkLabel };
}

function parseIngredient(value: unknown): RecipeIngredient {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    text: stringValue(raw.text),
    quantity: stringValue(raw.quantity) || null,
    unit: stringValue(raw.unit) || null,
    product: stringValue(raw.product) || null,
    note: stringValue(raw.note) || null,
  };
}

function parseStep(value: unknown, index = 0): RecipeStep {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const level = typeof raw.level === "number" && raw.level > 1 ? raw.level : undefined;
  const step: RecipeStep = {
    number: typeof raw.number === "number" ? raw.number : index + 1,
    text: stringValue(raw.text),
  };
  if (level) step.level = level;
  return step;
}

function parseImage(value: unknown): RecipeImage {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    id: stringValue(raw.id),
    mediaType: stringValue(raw.mediaType) || "image/jpeg",
    placement: stringValue(raw.placement) || undefined,
    widthPx: typeof raw.widthPx === "number" ? raw.widthPx : undefined,
    heightPx: typeof raw.heightPx === "number" ? raw.heightPx : undefined,
    description: stringValue(raw.description) || undefined,
    storagePath: stringValue(raw.storagePath) || undefined,
  };
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}
