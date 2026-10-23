import { colorHex } from "@/lib/colors";
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
  image: ImportedPhoto | null;
  items: ImportedItem[];
};

export type ImportedChecklistRow = {
  body: string;
  indent: 0 | 1;
  checked: boolean;
  sortOrder: number;
};

export type ImportedInventory = {
  categories: ImportedCategory[];
  lists: ImportedChecklistRow[] | null;
};

export async function readInventoryArchive(bytes: Uint8Array): Promise<ImportedInventory> {
  let entries: { name: string; data: Uint8Array }[];
  try {
    entries = await unzip(bytes);
  } catch {
    throw new InventoryFileError();
  }
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const name = zipName(entry.name);
    if (!name || name.split("/").includes("..")) continue;
    files.set(name, entry.data);
  }
  const documentBytes = files.get("inventory.json");
  if (!documentBytes) throw new InventoryFileError();
  let document: unknown;
  try {
    document = JSON.parse(new TextDecoder().decode(documentBytes));
  } catch {
    throw new InventoryFileError();
  }
  if (!document || typeof document !== "object" || !Array.isArray((document as { categories?: unknown }).categories)) {
    throw new InventoryFileError();
  }
  const record = document as { categories: unknown[]; lists?: unknown };
  const categories = record.categories.map((category, categoryIndex) => readCategory(category, categoryIndex, files));
  if (record.lists == null) return { categories, lists: null };
  if (!Array.isArray(record.lists)) throw new InventoryFileError();
  return { categories, lists: record.lists.map((row, index) => readChecklistRow(row, index)) };
}

function readChecklistRow(value: unknown, index: number): ImportedChecklistRow {
  if (!value || typeof value !== "object") throw new InventoryFileError();
  const row = value as Record<string, unknown>;
  return {
    body: typeof row.body === "string" ? row.body : "",
    indent: row.indent === 1 ? 1 : 0,
    checked: row.checked === true,
    sortOrder: order(row.sortOrder, index),
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
  if (!name || name.split("/").includes("..")) throw new InventoryFileError();
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
