import type { AccountEvent, EventKind } from "@/lib/types";

export const eventKinds = ["birthday", "anniversary", "death", "passing", "other"] as const;

export const hebrewMonths = [
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
] as const;

const kindLabels: Record<Exclude<EventKind, "other">, string> = {
  birthday: "יום הולדת",
  anniversary: "יום נישואין",
  death: "יום השנה",
  passing: "יום פטירה",
};

export function isEventKind(value: string): value is EventKind {
  return eventKinds.some((kind) => kind === value);
}

export function eventTypeLabel(event: Pick<AccountEvent, "kind" | "label">) {
  if (event.kind === "other") return event.label.trim();
  return kindLabels[event.kind];
}

export function sortEvents(events: AccountEvent[], today = new Date()) {
  return [...events].sort((a, b) => {
    const byUpcoming = daysUntil(a.month, a.day, today) - daysUntil(b.month, b.day, today);
    if (byUpcoming !== 0) return byUpcoming;
    return a.name.localeCompare(b.name, "he");
  });
}

export function countdownText(month: number, day: number, today = new Date()) {
  const days = daysUntil(month, day, today);
  if (days <= 0) return "היום";
  if (days === 1) return "עוד יום";
  if (days === 2) return "עוד יומיים";
  return `עוד ${days} ימים`;
}

/** Years reached on the next occurrence. יהיה stays on until that day. */
export function eventYears(event: Pick<AccountEvent, "year" | "month" | "day">, today = new Date()) {
  if (event.year == null || event.year > today.getFullYear()) return null;
  const until = daysUntil(event.month, event.day, today);
  const next = nextOccurrence(event.month, event.day, startOfDay(today));
  const years = next.getFullYear() - event.year;
  if (years < 1) return null;
  return { years, upcoming: until > 0 };
}

export type EventDraft = {
  kind: EventKind;
  name: string;
  label: string;
  month: number;
  day: number;
  year: number | null;
  comments: string;
};

export function eventDraftError(draft: EventDraft) {
  const name = draft.name.trim();
  if (!name) return "יש להזין שם";
  if (name.length > 80) return "השם ארוך מדי";
  if (!isEventKind(draft.kind)) return "יש לבחור סוג";
  if (draft.kind === "other") {
    const label = draft.label.trim();
    if (!label) return "יש להזין טקסט לאירוע";
    if (label.length > 80) return "הטקסט ארוך מדי";
  }
  if (!Number.isInteger(draft.month) || draft.month < 1 || draft.month > 12) return "יש לבחור חודש";
  if (!validDay(draft.year, draft.month, draft.day)) return "התאריך אינו תקין";
  if (draft.year != null && (!Number.isInteger(draft.year) || draft.year < 1 || draft.year > 9999)) return "השנה אינה תקינה";
  if (draft.comments.trim().length > 1000) return "ההערה ארוכה מדי";
  return null;
}

export function eventRecord(draft: EventDraft) {
  return {
    kind: draft.kind,
    name: draft.name.trim(),
    label: draft.kind === "other" ? draft.label.trim() : "",
    month: draft.month,
    day: draft.day,
    year: draft.year,
    comments: draft.comments.trim(),
  };
}

export function normalizeEvent(row: {
  id: string;
  account_id: string;
  kind: string;
  name: string;
  label?: string | null;
  month: number;
  day: number;
  year?: number | null;
  comments?: string | null;
  image_path?: string | null;
}): AccountEvent {
  const kind = isEventKind(row.kind) ? row.kind : "other";
  return {
    id: row.id,
    account_id: row.account_id,
    kind,
    name: row.name,
    label: typeof row.label === "string" ? row.label : "",
    month: row.month,
    day: row.day,
    year: typeof row.year === "number" ? row.year : null,
    comments: row.comments ?? "",
    image_path: row.image_path ?? null,
  };
}

function daysUntil(month: number, day: number, today: Date) {
  const start = startOfDay(today);
  const next = nextOccurrence(month, day, start);
  return Math.round((next.getTime() - start.getTime()) / 86400000);
}

function nextOccurrence(month: number, day: number, today: Date) {
  const year = today.getFullYear();
  let date = calendarDate(year, month, day);
  if (date < today) date = calendarDate(year + 1, month, day);
  return date;
}

function calendarDate(year: number, month: number, day: number) {
  return new Date(year, month - 1, Math.min(day, daysInMonth(year, month)));
}

function validDay(year: number | null, month: number, day: number) {
  if (!Number.isInteger(day) || day < 1) return false;
  if (year == null) return day <= (month === 2 ? 29 : daysInMonth(2024, month));
  return day <= daysInMonth(year, month);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
