import type { ChecklistRow } from "@/lib/types";

export function normalizeChecklist(row: {
  id: string;
  account_id: string;
  body: string | null;
  indent: number;
  checked: boolean;
  sort_order: number;
}): ChecklistRow {
  return {
    id: row.id,
    account_id: row.account_id,
    body: row.body ?? "",
    indent: row.indent === 1 ? 1 : 0,
    checked: Boolean(row.checked),
    sort_order: Number(row.sort_order) || 0,
  };
}

export function sortChecklist(rows: ChecklistRow[]) {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function numberRows(rows: ChecklistRow[]) {
  return rows.map((row, index) => (row.sort_order === index ? row : { ...row, sort_order: index }));
}

function hasTopLevelBefore(rows: ChecklistRow[], index: number) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (rows[i].indent === 0) return true;
  }
  return false;
}

export function parentOf(rows: ChecklistRow[], index: number) {
  if (rows[index]?.indent !== 1) return null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (rows[i].indent === 0) return rows[i];
  }
  return null;
}

export function siblingInsertIndex(rows: ChecklistRow[], afterId: string) {
  const index = rows.findIndex((row) => row.id === afterId);
  if (index < 0) return -1;
  if (rows[index].indent === 0) {
    let next = index + 1;
    while (next < rows.length && rows[next].indent === 1) next += 1;
    return next;
  }
  return index + 1;
}

export function insertChecklistRow(rows: ChecklistRow[], row: ChecklistRow, index: number) {
  return numberRows([...rows.slice(0, index), row, ...rows.slice(index)]);
}

export function withoutChecklistRow(rows: ChecklistRow[], id: string) {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return rows;
  const childIds = new Set<string>();
  if (rows[index].indent === 0) {
    for (let i = index + 1; i < rows.length && rows[i].indent === 1; i += 1) childIds.add(rows[i].id);
  }
  return numberRows(
    rows
      .filter((row) => row.id !== id)
      .map((row) => (childIds.has(row.id) ? { ...row, indent: 0 } : row)),
  );
}

function samePlacement(left: ChecklistRow[], right: ChecklistRow[]) {
  return left.length === right.length && left.every((row, index) => row.id === right[index].id && row.indent === right[index].indent);
}

function blockIndexes(rows: ChecklistRow[], id: string) {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return [];
  if (rows[index].indent === 1) return [index];
  const indexes = [index];
  for (let next = index + 1; next < rows.length && rows[next].indent === 1; next += 1) indexes.push(next);
  return indexes;
}

export function moveChecklistRow(rows: ChecklistRow[], activeId: string, overId: string) {
  if (activeId === overId) return null;
  const sorted = sortChecklist(rows);
  const indexes = blockIndexes(sorted, activeId);
  const overIndex = sorted.findIndex((row) => row.id === overId);
  if (indexes.length === 0 || overIndex < 0 || indexes.includes(overIndex)) return null;

  const block = indexes.map((index) => sorted[index]);
  const rest = sorted.filter((_, index) => !indexes.includes(index));
  let insertAt = rest.findIndex((row) => row.id === overId);
  if (insertAt < 0) return null;

  const active = block[0];
  const over = rest[insertAt];
  const activeIndex = indexes[0];
  if (active.indent === 1 && over.indent === 0) {
    insertAt += 1;
  } else if (active.indent === 0) {
    if (over.indent === 1) {
      let parentAt = insertAt;
      while (parentAt > 0 && rest[parentAt].indent !== 0) parentAt -= 1;
      if (rest[parentAt]?.indent === 0) insertAt = parentAt;
    }
    if (activeIndex < overIndex) {
      let end = insertAt + 1;
      while (end < rest.length && rest[end].indent === 1) end += 1;
      insertAt = end;
    }
  } else if (activeIndex < overIndex) {
    insertAt += 1;
  }

  const moved = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
  const fixed = moved.map((row, index) => (row.indent === 1 && !hasTopLevelBefore(moved, index) ? { ...row, indent: 0 as const } : row));
  if (samePlacement(sorted, fixed)) return null;
  return numberRows(fixed);
}

export function changeIndent(rows: ChecklistRow[], id: string, direction: "increase" | "decrease") {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const row = rows[index];
  if (direction === "increase") {
    if (row.indent === 1 || !hasTopLevelBefore(rows, index)) return null;
    return rows.map((entry) => (entry.id === id ? { ...entry, indent: 1 as const } : entry));
  }
  if (row.indent === 0) return null;
  return rows.map((entry) => (entry.id === id ? { ...entry, indent: 0 as const } : entry));
}

export type ChecklistEntry = { kind: "item"; row: ChecklistRow } | { kind: "parentCopy"; row: ChecklistRow };

export function activeEntries(rows: ChecklistRow[]): ChecklistEntry[] {
  return sortChecklist(rows)
    .filter((row) => !row.checked)
    .map((row) => ({ kind: "item", row }));
}

export function doneEntries(rows: ChecklistRow[]): ChecklistEntry[] {
  const sorted = sortChecklist(rows);
  const entries: ChecklistEntry[] = [];
  const copied = new Set<string>();
  sorted.forEach((row, index) => {
    if (!row.checked) return;
    const parent = parentOf(sorted, index);
    if (parent && !parent.checked && !copied.has(parent.id)) {
      copied.add(parent.id);
      entries.push({ kind: "parentCopy", row: parent });
    }
    entries.push({ kind: "item", row });
  });
  return entries;
}
