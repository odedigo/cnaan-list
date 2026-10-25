export const UNITS = [
  { id: "unit", label: "יחידה", short: "יח'" },
  { id: "kg", label: "ק״ג", short: "ק״ג" },
  { id: "g", label: "גרם", short: "גר'" },
  { id: "l", label: "ליטר", short: "ליטר" },
  { id: "ml", label: "מ״ל", short: "מ״ל" },
  { id: "pack", label: "חבילה", short: "חב'" },
  { id: "box", label: "קופסה", short: "קפ'" },
  { id: "bag", label: "שקית", short: "שק'" },
  { id: "bottle", label: "בקבוק", short: "בק'" },
] as const;

export type UnitId = (typeof UNITS)[number]["id"];

export function isUnitId(value: string): value is UnitId {
  return UNITS.some((unit) => unit.id === value);
}

export function unitById(id: string) {
  return UNITS.find((unit) => unit.id === id) ?? UNITS[0];
}

export const MIN_QUANTITY = 0.01;

export function formatQuantity(value: number) {
  if (!Number.isFinite(value)) return "1";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function parseQuantity(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  if (!Number.isFinite(parsed)) return 1;
  const rounded = Math.round(parsed * 100) / 100;
  if (rounded < MIN_QUANTITY) return 1;
  return rounded;
}

/** Moves the last displayed digit: 2 → 3, 2.2 → 2.3, 0.15 → 0.16. */
export function stepQuantity(quantity: number, direction: number) {
  const text = formatQuantity(quantity);
  const decimals = text.includes(".") ? text.split(".")[1].length : 0;
  const scale = 10 ** decimals;
  const sign = direction < 0 ? -1 : 1;
  const current = Math.round(quantity * scale);
  const next = (current + sign) / scale;
  const rounded = Math.round(next * 100) / 100;
  if (rounded < MIN_QUANTITY) return Math.round(quantity * 100) / 100;
  return rounded;
}
