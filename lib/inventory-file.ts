import { checklistPriority } from "@/lib/checklist";
import { colorHex } from "@/lib/colors";
import type { ChecklistPriority } from "@/lib/types";
import { isUnitId, parseQuantity, type UnitId } from "@/lib/units";
import { unzip } from "@/lib/zip";

export class InventoryFileError extends Error {
  constructor() {
    super("הקובץ אינו ייצוא של הרשימה");
    this.name = "InventoryFileError";
  }
}

export type ImportedPhoto = {
  name: string;
  bytes: Uint8Array;
  contentType: "image/webp" | "image/jpeg" | "image/png" | null;
};

export type ImportedItem = {
  sourceId: string | null;
  name: string;
  unit: UnitId;
  quantity: number;
  comments: string;
  sortOrder: number;
  image: ImportedPhoto | null;
};

export type ImportedCategory = {
  name: string;
  color: string;
  sortOrder: number;
  store: string | null;
  separatorAfter: boolean;
  separatorText: string;
  image: ImportedPhoto | null;
  items: ImportedItem[];
};

export type ImportedChecklistRow = {
  body: string;
  indent: 0 | 1;
  checked: boolean;
  sortOrder: number;
  priority: ChecklistPriority | null;
};

export type ImportedGroceryLine = {
  itemId: string | null;
  category: string;
  item: string;
  checked: boolean;
};

export type ImportedPackingItem = {
  name: string;
  quantity: number;
  checked: boolean;
  sortOrder: number;
};

export type ImportedPackingCategory = {
  name: string;
  color: string;
  sortOrder: number;
  items: ImportedPackingItem[];
};

export type ImportedPackingList = {
  name: string;
  favorite: boolean;
  sortOrder: number;
  categories: ImportedPackingCategory[];
};

export type ImportedInventory = {
  categories: ImportedCategory[] | null;
  grocery: ImportedGroceryLine[] | null;
  lists: ImportedChecklistRow[] | null;
  packing: ImportedPackingList[] | null;
};

export type ArchiveFlags = {
  inventory: boolean;
  grocery: boolean;
  lists: boolean;
  recipes: boolean;
  packing: boolean;
};

export async function openZip(bytes: Uint8Array, onProgress?: (ratio: number) => void) {
  let entries: { name: string; data: Uint8Array }[];
  try {
    entries = await unzip(bytes, onProgress);
  } catch {
    throw new InventoryFileError();
  }
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const name = zipName(entry.name);
    if (!name || name.split("/").includes("..")) continue;
    files.set(name, entry.data);
  }
  return files;
}

export async function inspectArchive(bytes: Uint8Array): Promise<ArchiveFlags> {
  const files = await openZip(bytes);
  const recipes = files.has("recipes.json");
  const documentBytes = files.get("inventory.json");
  if (!documentBytes) {
    if (!recipes) throw new InventoryFileError();
    return { inventory: false, grocery: false, lists: false, recipes: true, packing: false };
  }
  const record = parseDocument(documentBytes);
  return {
    inventory: Array.isArray(record.categories),
    grocery: Array.isArray(record.grocery),
    lists: Array.isArray(record.lists),
    recipes,
    packing: Array.isArray(record.packing),
  };
}

export async function readInventoryArchive(bytes: Uint8Array): Promise<ImportedInventory> {
  return readInventoryFiles(await openZip(bytes));
}

export function readInventoryFiles(files: Map<string, Uint8Array>): ImportedInventory {
  const documentBytes = files.get("inventory.json");
  if (!documentBytes) {
    if (!files.has("recipes.json")) throw new InventoryFileError();
    return { categories: null, grocery: null, lists: null, packing: null };
  }
  const record = parseDocument(documentBytes);
  const categories = Array.isArray(record.categories)
    ? record.categories.map((category, categoryIndex) => readCategory(category, categoryIndex, files))
    : null;
  const grocery = Array.isArray(record.grocery) ? record.grocery.map(readGroceryLine) : null;
  const lists = readListRows(record.lists);
  const packing = readPackingLists(record.packing);
  return { categories, grocery, lists, packing };
}

function parseDocument(bytes: Uint8Array) {
  let document: unknown;
  try {
    document = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InventoryFileError();
  }
  if (!document || typeof document !== "object") throw new InventoryFileError();
  return document as { categories?: unknown; grocery?: unknown; lists?: unknown; packing?: unknown };
}

function readListRows(value: unknown) {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new InventoryFileError();
  return value.map((row, index) => readChecklistRow(row, index));
}

export function readPackingListFile(bytes: Uint8Array) {
  let document: unknown;
  try {
    document = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InventoryFileError();
  }
  return readPackingList(document, 0);
}

function readPackingLists(value: unknown) {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new InventoryFileError();
  return value.map((row, index) => readPackingList(row, index));
}

function readPackingList(value: unknown, index: number): ImportedPackingList {
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const row = value as Record<string, unknown>;
  const name = clipName(row.name);
  if (!name) throw new InventoryFileError();
  if (!Array.isArray(row.categories)) throw new InventoryFileError();
  return {
    name,
    favorite: row.favorite === true,
    sortOrder: order(row.sortOrder, index),
    categories: row.categories.map((category, categoryIndex) => readPackingCategory(category, categoryIndex)),
  };
}

function readPackingCategory(value: unknown, index: number): ImportedPackingCategory {
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const row = value as Record<string, unknown>;
  const name = clipName(row.name);
  if (!name) throw new InventoryFileError();
  if (!Array.isArray(row.items)) throw new InventoryFileError();
  return {
    name,
    color: colorHex(typeof row.color === "string" ? row.color : ""),
    sortOrder: order(row.sortOrder, index),
    items: row.items.map((item, itemIndex) => readPackingItem(item, itemIndex)),
  };
}

function readPackingItem(value: unknown, index: number): ImportedPackingItem {
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const row = value as Record<string, unknown>;
  const name = clipName(row.name);
  if (!name) throw new InventoryFileError();
  return {
    name,
    quantity: parseQuantity(typeof row.quantity === "number" || typeof row.quantity === "string" ? String(row.quantity) : ""),
    checked: row.checked === true,
    sortOrder: order(row.sortOrder, index),
  };
}

function clipName(value: unknown) {
  const name = text(value);
  return name ? name.slice(0, 80) : "";
}

function readGroceryLine(value: unknown): ImportedGroceryLine {
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const row = value as Record<string, unknown>;
  const item = text(row.item);
  if (!item) throw new InventoryFileError();
  return {
    itemId: typeof row.itemId === "string" && row.itemId.trim() ? row.itemId.trim() : null,
    category: text(row.category),
    item,
    checked: row.checked === true,
  };
}

function readChecklistRow(value: unknown, index: number): ImportedChecklistRow {
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const row = value as Record<string, unknown>;
  return {
    body: typeof row.body === "string" ? row.body : "",
    indent: row.indent === 1 ? 1 : 0,
    checked: row.checked === true,
    sortOrder: order(row.sortOrder, index),
    priority: checklistPriority(row.priority),
  };
}

function readCategory(value: unknown, index: number, files: Map<string, Uint8Array>): ImportedCategory {
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const category = value as Record<string, unknown>;
  const name = text(category.name);
  if (!name) throw new InventoryFileError();
  if (!Array.isArray(category.items)) throw new InventoryFileError();
  return {
    name,
    color: colorHex(typeof category.color === "string" ? category.color : ""),
    sortOrder: order(category.sortOrder, index),
    store: typeof category.store === "string" && category.store.trim() ? category.store.trim() : null,
    separatorAfter: category.separatorAfter === true,
    separatorText: typeof category.separatorText === "string" ? category.separatorText.trim() : "",
    image: photo(category.image, files),
    items: category.items.map((item, itemIndex) => readItem(item, itemIndex, files)),
  };
}

function readItem(value: unknown, index: number, files: Map<string, Uint8Array>): ImportedItem {
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const item = value as Record<string, unknown>;
  const name = text(item.name);
  if (!name) throw new InventoryFileError();
  const unit = typeof item.unit === "string" && isUnitId(item.unit) ? item.unit : "unit";
  return {
    sourceId: typeof item.id === "string" && item.id.trim() ? item.id.trim() : null,
    name,
    unit,
    quantity: parseQuantity(typeof item.quantity === "number" || typeof item.quantity === "string" ? String(item.quantity) : ""),
    comments: typeof item.comments === "string" ? item.comments : "",
    sortOrder: order(item.sortOrder, index),
    image: photo(item.image, files),
  };
}

function photo(value: unknown, files: Map<string, Uint8Array>): ImportedPhoto | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new InventoryFileError();
  const name = zipName(value);
  if (!name || name.split("/").includes("..") || !name.startsWith("images/")) {
    throw new InventoryFileError();
  }
  const bytes = files.get(name);
  if (!bytes || bytes.byteLength === 0) throw new InventoryFileError();
  return { name, bytes, contentType: contentTypeFor(name) };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function order(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function zipName(value: string) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function contentTypeFor(name: string): ImportedPhoto["contentType"] {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "webp") return "image/webp";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return null;
}
