export const ACCOUNT_SECTIONS = ["shopping", "lists", "recipes", "packing", "trees", "events"] as const;

export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];

export const accountSectionOptions: { id: AccountSection; label: string }[] = [
  { id: "shopping", label: "קניות" },
  { id: "lists", label: "רשימות" },
  { id: "recipes", label: "מתכונים" },
  { id: "packing", label: "אריזות" },
  { id: "trees", label: "יוחסין" },
  { id: "events", label: "ארועים" },
];

export function accountSections(value: unknown): AccountSection[] {
  if (!Array.isArray(value)) return [...ACCOUNT_SECTIONS];
  return ACCOUNT_SECTIONS.filter((id) => value.includes(id));
}

export function sectionForPath(path: string): AccountSection | null {
  if (path === "/inventory" || path.startsWith("/inventory/") || path === "/grocery" || path.startsWith("/grocery/")) return "shopping";
  if (path === "/lists" || path.startsWith("/lists/")) return "lists";
  if (path === "/recipes" || path.startsWith("/recipes/")) return "recipes";
  if (path === "/packing" || path.startsWith("/packing/")) return "packing";
  if (path === "/trees" || path.startsWith("/trees/")) return "trees";
  if (path === "/dates" || path.startsWith("/dates/")) return "events";
  return null;
}

export function firstSectionPath(sections: readonly AccountSection[]) {
  if (sections.includes("shopping")) return "/inventory";
  if (sections.includes("lists")) return "/lists";
  if (sections.includes("recipes")) return "/recipes";
  if (sections.includes("packing")) return "/packing";
  if (sections.includes("events")) return "/dates";
  if (sections.includes("trees")) return "/trees";
  return "/settings";
}
