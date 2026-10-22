export function mergeVisibleOrder(fullIds: string[], nextVisibleIds: string[]) {
  const visible = new Set(nextVisibleIds);
  let index = 0;
  return fullIds.map((id) => (visible.has(id) ? (nextVisibleIds[index++] ?? id) : id));
}

export function sortByOrder<T extends { sort_order: number }>(rows: T[]) {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

export function applyOrder<T extends { id: string; sort_order: number }>(rows: T[], ids: string[]) {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return sortByOrder(rows.map((row) => ({ ...row, sort_order: rank.get(row.id) ?? row.sort_order })));
}

export function moveVisible(fullIds: string[], visibleIds: string[], activeId: string, overId: string) {
  const oldIndex = visibleIds.indexOf(activeId);
  const newIndex = visibleIds.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0) return fullIds;
  const next = [...visibleIds];
  const [moved] = next.splice(oldIndex, 1);
  if (!moved) return fullIds;
  next.splice(newIndex, 0, moved);
  return mergeVisibleOrder(fullIds, next);
}
