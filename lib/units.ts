export const UNITS = [
  { id: "unit", label: "יחידה", short: "יח" },
  { id: "kg", label: "ק״ג", short: "ק״ג" },
  { id: "g", label: "גרם", short: "גרם" },
  { id: "l", label: "ליטר", short: "ליטר" },
  { id: "ml", label: "מ״ל", short: "מ״ל" },
  { id: "pack", label: "חבילה", short: "חבילה" },
  { id: "box", label: "קופסה", short: "קופסה" },
  { id: "bag", label: "שקית", short: "שקית" },
  { id: "bottle", label: "בקבוק", short: "בקבוק" },
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

export function stepQuantity(quantity: number, delta: number) {
  const next = Math.round((quantity + delta) * 100) / 100;
  if (next < MIN_QUANTITY) return quantity;
  return next;
}
