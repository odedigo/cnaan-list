/** Places every person in a family chart, grouped by parents and spouses. */

import type { FamilyChild, FamilyPerson, FamilyUnion, UnionStatus } from "@/lib/family-trees";

export const CARD_W = 156;
export const CARD_H = 72;
export const LINKED_EXTRA = 22;

const GAP_X = 52;
const LANE = 20;
const BAND_PAD = 32;

export type TreeBox = { id: string; x: number; y: number; height: number };
export type TreePoint = { x: number; y: number };
export type TreeLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points: TreePoint[];
  kind: "spouse" | "child";
  status?: UnionStatus;
};

type Placed = { id: string; x: number; y: number; depth: number };
type Span = { left: number; right: number; boxes: Placed[] };

export function layoutTree(people: FamilyPerson[], unions: FamilyUnion[], children: FamilyChild[], linked?: ReadonlySet<string>) {
  const cardHeight = (id: string) => (linked?.has(id) ? CARD_H + LINKED_EXTRA : CARD_H);
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
  const boxes: Placed[] = [];
  let cursor = 0;

  function place(span: Span) {
    if (span.boxes.length === 0) return;
    const shift = cursor - span.left;
    for (const box of span.boxes) boxes.push({ id: box.id, x: box.x + shift, y: box.y, depth: box.depth });
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
        if (other && known.has(other) && !memberSet.has(other) && !visited.has(other) && !next.has(other)) {
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
        boxes: span.boxes.map((box) => ({ id: box.id, x: box.x + shift, y: box.y, depth: box.depth })),
      });
      childCursor = span.right + shift + GAP_X;
    }

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
    const memberBoxes = ordered.map((id, index) => ({
      id,
      x: memberStart + index * (CARD_W + GAP_X),
      y: 0,
      depth,
    }));
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

  const placedList = uniqueBoxes(boxes);
  const placed = new Map(placedList.map((box) => [box.id, box]));
  const maxDepth = placedList.reduce((max, box) => Math.max(max, box.depth), 0);
  const heightAt = new Map<number, number>();
  for (const box of placedList) {
    heightAt.set(box.depth, Math.max(heightAt.get(box.depth) ?? 0, cardHeight(box.id)));
  }

  const spans: { key: string; gap: number; x1: number; x2: number }[] = [];
  for (const union of unions) {
    const first = placed.get(union.partner_a);
    const second = union.partner_b ? placed.get(union.partner_b) : undefined;
    if (first && second && first.depth !== second.depth) {
      const upper = first.depth < second.depth ? first : second;
      const lower = upper === first ? second : first;
      const x1 = cardExitX(upper, lower.x + CARD_W / 2);
      const x2 = cardExitX(lower, upper.x + CARD_W / 2);
      spans.push({
        key: `spouse:${union.id}`,
        gap: lower.depth - 1,
        x1: Math.min(x1, x2),
        x2: Math.max(x1, x2),
      });
    } else if (first && second && first.depth === second.depth) {
      const left = first.x < second.x ? first : second;
      const right = left === first ? second : first;
      if (right.x - (left.x + CARD_W) > GAP_X + 8) {
        const x1 = left.x + CARD_W;
        const x2 = right.x;
        spans.push({ key: `spouse:${union.id}`, gap: left.depth, x1, x2 });
      }
    }
    const parents = [first, second].filter((box): box is Placed => Boolean(box));
    const byDepth = new Map<number, Placed[]>();
    for (const link of kidsByUnion.get(union.id) ?? []) {
      const child = placed.get(link.person_id);
      if (!child) continue;
      const above = parents.filter((box) => box.depth < child.depth);
      if (above.length === 0) continue;
      const list = byDepth.get(child.depth) ?? [];
      list.push(child);
      byDepth.set(child.depth, list);
    }
    for (const [childDepth, kids] of byDepth) {
      const above = parents.filter((box) => box.depth < childDepth);
      const sourceX = anchorX(above);
      const xs = kids.map((kid) => kid.x + CARD_W / 2);
      const x1 = Math.min(sourceX, ...xs);
      const x2 = Math.max(sourceX, ...xs);
      if (x2 - x1 > 1) {
        spans.push({ key: `child:${union.id}:${childDepth}`, gap: childDepth - 1, x1, x2 });
      }
    }
  }

  const laneOf = new Map<string, number>();
  const lanesInGap = new Map<number, number>();
  const byGap = new Map<number, { key: string; x1: number; x2: number }[]>();
  for (const span of spans) {
    if (span.gap < 0) continue;
    const list = byGap.get(span.gap) ?? [];
    list.push(span);
    byGap.set(span.gap, list);
  }
  for (const [gap, list] of byGap) {
    const lanes = assignLanes(list);
    lanesInGap.set(gap, Math.max(1, lanes.count));
    for (const [key, lane] of lanes.index) laneOf.set(key, lane);
  }

  const genY: number[] = [];
  let cursorY = 16;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    genY[depth] = cursorY;
    const card = heightAt.get(depth) ?? CARD_H;
    const lanes = lanesInGap.get(depth) ?? 1;
    cursorY += card + BAND_PAD + lanes * LANE + BAND_PAD;
  }
  for (const box of placedList) box.y = genY[box.depth] ?? 16;

  const routes: Route[] = [];
  function busY(gap: number, lane: number) {
    const top = (genY[gap] ?? 16) + (heightAt.get(gap) ?? CARD_H) + BAND_PAD;
    return top + lane * LANE;
  }
  function addRoute(points: TreePoint[], kind: Route["kind"], status?: UnionStatus) {
    const route = routeOf(points, kind, status);
    if (route.points.length >= 2) routes.push(route);
  }

  for (const union of unions) {
    const first = placed.get(union.partner_a);
    const second = union.partner_b ? placed.get(union.partner_b) : undefined;
    if (first && second) {
      const left = first.x <= second.x ? first : second;
      const right = left === first ? second : first;
      if (left.depth === right.depth && right.x - (left.x + CARD_W) <= GAP_X + 8) {
        const y = sharedMidY(left, right, cardHeight);
        addRoute(
          [
            { x: left.x + CARD_W, y },
            { x: right.x, y },
          ],
          "spouse",
          union.status,
        );
      } else {
        const upper = left.depth <= right.depth ? left : right;
        const lower = upper === left ? right : left;
        const y = left.depth === right.depth
          ? busY(left.depth, laneOf.get(`spouse:${union.id}`) ?? 0)
          : busY(Math.max(0, lower.depth - 1), laneOf.get(`spouse:${union.id}`) ?? 0);
        const x1 = cardExitX(upper, lower.x + CARD_W / 2);
        const x2 = cardExitX(lower, upper.x + CARD_W / 2);
        const y1 = upper.y + cardHeight(upper.id) / 2;
        const y2 = lower.y + cardHeight(lower.id) / 2;
        addRoute(
          [
            { x: x1, y: y1 },
            { x: x1, y },
            { x: x2, y },
            { x: x2, y: y2 },
          ],
          "spouse",
          union.status,
        );
      }
    }
    const parents = [first, second].filter((box): box is Placed => Boolean(box));
    const byDepth = new Map<number, Placed[]>();
    for (const link of kidsByUnion.get(union.id) ?? []) {
      const child = placed.get(link.person_id);
      if (!child) continue;
      if (!parents.some((box) => box.depth < child.depth)) continue;
      const list = byDepth.get(child.depth) ?? [];
      list.push(child);
      byDepth.set(child.depth, list);
    }
    for (const [childDepth, kids] of byDepth) {
      const above = parents.filter((box) => box.depth < childDepth);
      const anchor = anchorPoint(above, cardHeight);
      const y = busY(Math.max(0, childDepth - 1), laneOf.get(`child:${union.id}:${childDepth}`) ?? 0);
      const childXs = kids.map((kid) => kid.x + CARD_W / 2);
      const left = Math.min(anchor.x, ...childXs);
      const right = Math.max(anchor.x, ...childXs);
      addRoute(
        [
          { x: anchor.x, y: anchor.y },
          { x: anchor.x, y },
        ],
        "child",
      );
      if (right - left > 1) {
        addRoute(
          [
            { x: left, y },
            { x: right, y },
          ],
          "child",
        );
      }
      for (const kid of kids) {
        const x = kid.x + CARD_W / 2;
        addRoute(
          [
            { x, y },
            { x, y: kid.y },
          ],
          "child",
        );
      }
    }
  }

  return {
    boxes: placedList.map((box) => ({ id: box.id, x: box.x, y: box.y, height: cardHeight(box.id) })),
    lines: routes.map(toTreeLine),
  };
}

/** Spouses who married in. A spouse who is also a child, or a parent of the family line, stays in the family. */
export function spousesOutsideFamily(unions: FamilyUnion[], children: FamilyChild[]) {
  const kidsByUnion = new Map<string, number>();
  const family = new Set<string>();
  for (const link of children) {
    family.add(link.person_id);
    kidsByUnion.set(link.union_id, (kidsByUnion.get(link.union_id) ?? 0) + 1);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const union of unions) {
      if ((kidsByUnion.get(union.id) ?? 0) === 0) continue;
      const parents = [union.partner_a, union.partner_b].filter((id): id is string => Boolean(id));
      if (parents.some((id) => family.has(id))) continue;
      for (const id of parents) {
        if (family.has(id)) continue;
        family.add(id);
        changed = true;
      }
    }
  }
  const outside = new Set<string>();
  for (const union of unions) {
    for (const id of [union.partner_a, union.partner_b]) {
      if (id && !family.has(id)) outside.add(id);
    }
  }
  return outside;
}

export function rootPersonId(people: FamilyPerson[], children: FamilyChild[]) {
  if (people.length === 0) return null;
  const childIds = new Set(children.map((link) => link.person_id));
  return people.find((person) => !childIds.has(person.id))?.id ?? people[0].id;
}

type Route = { points: TreePoint[]; kind: TreeLine["kind"]; status?: UnionStatus };

function cardExitX(box: Placed, towardX: number) {
  return towardX >= box.x + CARD_W / 2 ? box.x + CARD_W : box.x;
}

function anchorX(above: Placed[]) {
  const sorted = [...above].sort((a, b) => a.x - b.x || a.depth - b.depth);
  const left = sorted[0];
  const right = sorted[sorted.length - 1];
  if (left && right && left !== right && left.depth === right.depth && right.x - (left.x + CARD_W) <= GAP_X + 8) {
    return (left.x + CARD_W + right.x) / 2;
  }
  const lower = above.reduce((best, box) => (box.depth >= best.depth ? box : best));
  return lower.x + CARD_W / 2;
}

function sharedMidY(a: Placed, b: Placed, height: (id: string) => number) {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + height(a.id), b.y + height(b.id));
  return bottom > top ? (top + bottom) / 2 : a.y + height(a.id) / 2;
}

function anchorPoint(above: Placed[], height: (id: string) => number) {
  const x = anchorX(above);
  const sorted = [...above].sort((a, b) => a.x - b.x || a.depth - b.depth);
  const left = sorted[0];
  const right = sorted[sorted.length - 1];
  if (left && right && left !== right && Math.abs(x - (left.x + CARD_W + right.x) / 2) < 0.5) {
    return { x, y: sharedMidY(left, right, height) };
  }
  const lower = above.reduce((best, box) => (box.depth >= best.depth ? box : best));
  return { x: lower.x + CARD_W / 2, y: lower.y + height(lower.id) };
}

function assignLanes(spans: { key: string; x1: number; x2: number }[]) {
  const lanes: { x1: number; x2: number }[][] = [];
  const index = new Map<string, number>();
  const order = [...spans].sort((a, b) => a.x1 - b.x1 || a.x2 - b.x2);
  for (const span of order) {
    let lane = lanes.findIndex((list) => list.every((other) => !rangeOverlap(other.x1, other.x2, span.x1, span.x2)));
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push({ x1: span.x1, x2: span.x2 });
    index.set(span.key, lane);
  }
  return { index, count: lanes.length };
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number) {
  const left = Math.max(Math.min(a1, a2), Math.min(b1, b2));
  const right = Math.min(Math.max(a1, a2), Math.max(b1, b2));
  return right - left > 1;
}

function routeOf(points: TreePoint[], kind: Route["kind"], status?: UnionStatus): Route {
  const next: TreePoint[] = [];
  for (const point of points) {
    const previous = next[next.length - 1];
    if (previous && Math.abs(previous.x - point.x) < 0.5 && Math.abs(previous.y - point.y) < 0.5) continue;
    if (next.length >= 2) {
      const a = next[next.length - 2];
      const b = next[next.length - 1];
      const straight =
        (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - point.x) < 0.5) ||
        (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - point.y) < 0.5);
      if (straight) {
        next[next.length - 1] = point;
        continue;
      }
    }
    next.push(point);
  }
  return { points: next, kind, status };
}

function toTreeLine(route: Route): TreeLine {
  const first = route.points[0] ?? { x: 0, y: 0 };
  const last = route.points[route.points.length - 1] ?? first;
  return {
    x1: first.x,
    y1: first.y,
    x2: last.x,
    y2: last.y,
    points: route.points,
    kind: route.kind,
    status: route.status,
  };
}

function uniqueBoxes(boxes: Placed[]) {
  const seen = new Set<string>();
  const next: Placed[] = [];
  for (const box of boxes) {
    if (seen.has(box.id)) continue;
    seen.add(box.id);
    next.push(box);
  }
  return next;
}
