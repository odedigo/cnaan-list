/** Places every person in a family chart, grouped by parents and spouses. */

import type { FamilyChild, FamilyPerson, FamilyUnion } from "@/lib/family-trees";

export const CARD_W = 156;
export const CARD_H = 72;

const GAP_X = 28;
const ROW = CARD_H + 88;

export type TreeBox = { id: string; x: number; y: number };
export type TreeLine = { x1: number; y1: number; x2: number; y2: number };

type Span = { left: number; right: number; boxes: TreeBox[] };

export function layoutTree(people: FamilyPerson[], unions: FamilyUnion[], children: FamilyChild[]) {
  const known = new Set(people.map((person) => person.id));
  const childIds = new Set<string>();
  const kidsByUnion = new Map<string, FamilyChild[]>();
  for (const link of children) {
    if (!known.has(link.person_id)) continue;
    childIds.add(link.person_id);
    const list = kidsByUnion.get(link.union_id) ?? [];
    list.push(link);
    kidsByUnion.set(link.union_id, list);
  }
  for (const list of kidsByUnion.values()) list.sort((a, b) => a.sort_order - b.sort_order || a.person_id.localeCompare(b.person_id));

  const unionsByPerson = new Map<string, FamilyUnion[]>();
  for (const union of unions) {
    for (const id of [union.partner_a, union.partner_b]) {
      if (!id || !known.has(id)) continue;
      const list = unionsByPerson.get(id) ?? [];
      list.push(union);
      unionsByPerson.set(id, list);
    }
  }

  const visited = new Set<string>();
  const boxes: TreeBox[] = [];
  let cursor = 0;

  function place(span: Span) {
    if (span.boxes.length === 0) return;
    const shift = cursor - span.left;
    for (const box of span.boxes) boxes.push({ id: box.id, x: box.x + shift, y: box.y });
    cursor = span.right + shift + GAP_X * 3;
  }

  function layoutDown(personId: string, depth: number, stack: Set<string>): Span {
    if (!known.has(personId) || stack.has(personId) || visited.has(personId)) return { left: 0, right: 0, boxes: [] };
    visited.add(personId);
    const next = new Set(stack);
    next.add(personId);

    const members = [personId];
    const memberSet = new Set(members);
    const pending = [personId];
    const childList: string[] = [];
    const childSeen = new Set<string>();
    while (pending.length > 0) {
      const current = pending.shift() ?? "";
      for (const union of unionsByPerson.get(current) ?? []) {
        const other = union.partner_a === current ? union.partner_b : union.partner_a;
        if (other && known.has(other) && !childIds.has(other) && !memberSet.has(other) && !visited.has(other) && !next.has(other)) {
          visited.add(other);
          memberSet.add(other);
          members.push(other);
          next.add(other);
          pending.push(other);
        }
        for (const link of kidsByUnion.get(union.id) ?? []) {
          const childId = link.person_id;
          if (childSeen.has(childId) || memberSet.has(childId) || visited.has(childId) || next.has(childId)) continue;
          childSeen.add(childId);
          childList.push(childId);
        }
      }
    }

    const childSpans: Span[] = [];
    let childCursor = 0;
    for (const childId of childList) {
      const span = layoutDown(childId, depth + 1, next);
      if (span.boxes.length === 0) continue;
      const shift = childCursor - span.left;
      childSpans.push({
        left: span.left + shift,
        right: span.right + shift,
        boxes: span.boxes.map((box) => ({ id: box.id, x: box.x + shift, y: box.y })),
      });
      childCursor = span.right + shift + GAP_X;
    }

    const y = 16 + depth * ROW;
    const membersWidth = members.length * CARD_W + Math.max(0, members.length - 1) * GAP_X;
    const spouses = members.slice(1);
    const ordered = spouses.length > 1 ? [spouses[0], members[0], ...spouses.slice(1)] : members;
    let memberStart = 0;
    let spanLeft = 0;
    let spanRight = membersWidth;
    if (childSpans.length > 0) {
      const childrenLeft = childSpans[0].left;
      const childrenRight = childSpans[childSpans.length - 1].right;
      memberStart = (childrenLeft + childrenRight) / 2 - membersWidth / 2;
      spanLeft = Math.min(memberStart, childrenLeft);
      spanRight = Math.max(memberStart + membersWidth, childrenRight);
    }
    const memberBoxes = ordered.map((id, index) => ({ id, x: memberStart + index * (CARD_W + GAP_X), y }));
    return {
      left: spanLeft,
      right: spanRight,
      boxes: [...memberBoxes, ...childSpans.flatMap((span) => span.boxes)],
    };
  }

  function deferred(personId: string) {
    for (const union of unionsByPerson.get(personId) ?? []) {
      const other = union.partner_a === personId ? union.partner_b : union.partner_a;
      if (other && childIds.has(other) && !visited.has(other)) return true;
    }
    return false;
  }

  for (const person of people) {
    if (childIds.has(person.id) || visited.has(person.id) || deferred(person.id)) continue;
    place(layoutDown(person.id, 0, new Set()));
  }
  for (const person of people) {
    if (childIds.has(person.id) || visited.has(person.id)) continue;
    place(layoutDown(person.id, 0, new Set()));
  }
  for (const person of people) {
    if (visited.has(person.id)) continue;
    place(layoutDown(person.id, 0, new Set()));
  }

  const placed = new Map(boxes.map((box) => [box.id, box]));
  const lines: TreeLine[] = [];
  for (const union of unions) {
    const first = placed.get(union.partner_a);
    const second = union.partner_b ? placed.get(union.partner_b) : undefined;
    if (first && second) {
      if (Math.abs(first.y - second.y) < 2) {
        const [leftBox, rightBox] = first.x < second.x ? [first, second] : [second, first];
        const y = leftBox.y + CARD_H / 2;
        lines.push({ x1: leftBox.x + CARD_W, y1: y, x2: rightBox.x, y2: y });
      } else {
        lines.push({ x1: first.x + CARD_W / 2, y1: first.y + CARD_H / 2, x2: second.x + CARD_W / 2, y2: second.y + CARD_H / 2 });
      }
    }
    const parents = [first, second].filter((box): box is TreeBox => Boolean(box));
    for (const link of kidsByUnion.get(union.id) ?? []) {
      const child = placed.get(link.person_id);
      if (!child) continue;
      const above = parents.filter((box) => box.y + CARD_H <= child.y + 1);
      if (above.length === 0) continue;
      const sourceX = above.reduce((sum, box) => sum + box.x + CARD_W / 2, 0) / above.length;
      const parentBottom = Math.max(...above.map((box) => box.y)) + CARD_H;
      lines.push({ x1: sourceX, y1: parentBottom, x2: child.x + CARD_W / 2, y2: child.y });
    }
  }

  return { boxes: uniqueBoxes(boxes), lines };
}

export function rootPersonId(people: FamilyPerson[], children: FamilyChild[]) {
  if (people.length === 0) return null;
  const childIds = new Set(children.map((link) => link.person_id));
  return people.find((person) => !childIds.has(person.id))?.id ?? people[0].id;
}

function uniqueBoxes(boxes: TreeBox[]) {
  const seen = new Set<string>();
  const next: TreeBox[] = [];
  for (const box of boxes) {
    if (seen.has(box.id)) continue;
    seen.add(box.id);
    next.push(box);
  }
  return next;
}
