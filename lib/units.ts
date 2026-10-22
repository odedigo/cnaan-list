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

export function formatQuantity(value: number) {
  if (!Number.isFinite(value)) return "1";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function parseQuantity(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.round(parsed * 100) / 100;
}
