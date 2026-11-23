/** Places every person in a family chart, grouped by parents and spouses. A spouse keeps their own ancestors on rows above them, and the chart grows taller to make room. */

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
  color?: string;
};

export const FAMILY_LINE_COLORS = ["#0369a1", "#c2410c", "#6d28d9", "#3f6212", "#a16207", "#9f1239", "#0e7490", "#7c2d12", "#4338ca", "#be185d"];

type Placed = { id: string; x: number; y: number; depth: number };
type Phantom = { id: string; x: number };
type Span = { left: number; right: number; packLeft: number; packRight: number; boxes: Placed[]; phantoms: Phantom[] };
type Reserve = { id: string; side: "start" | "end"; width: number };

const EMPTY_SPAN: Span = { left: 0, right: 0, packLeft: 0, packRight: 0, boxes: [], phantoms: [] };

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

  const parentsOf = new Map<string, string[]>();
  for (const union of unions) {
    const parents = [union.partner_a, union.partner_b].filter((id): id is string => Boolean(id && known.has(id)));
    for (const link of kidsByUnion.get(union.id) ?? []) {
      const list = parentsOf.get(link.person_id) ?? [];
      for (const parent of parents) if (!list.includes(parent)) list.push(parent);
      parentsOf.set(link.person_id, list);
    }
  }

  const visited = new Set<string>();
  const boxes: Placed[] = [];
  let cursor = 0;

  function place(span: Span) {
    if (span.boxes.length === 0) return;
    const shift = cursor - span.packLeft;
    for (const box of span.boxes) boxes.push({ ...box, x: box.x + shift });
    cursor = span.packRight + shift + GAP_X * 3;
  }

  function layoutAncestors(childId: string, holeLeft: number, holeWidth: number, childDepth: number, stack: Set<string>, side: Reserve["side"]) {
    const parents = (parentsOf.get(childId) ?? []).filter((id) => !visited.has(id) && !stack.has(id));
    if (parents.length === 0) return [];
    const span = layoutDown(parents[0], childDepth - 1, stack, { id: childId, side, width: holeWidth });
    const phantom = span.phantoms.find((item) => item.id === childId);
    const anchor = phantom ? phantom.x : (span.packLeft + span.packRight) / 2 - holeWidth / 2;
    const shift = holeLeft - anchor;
    return span.boxes.map((box) => ({ ...box, x: box.x + shift }));
  }

  function layoutDown(personId: string, depth: number, stack: Set<string>, reserve?: Reserve): Span {
    if (!known.has(personId) || stack.has(personId) || visited.has(personId)) return EMPTY_SPAN;
    visited.add(personId);
    const next = new Set(stack);
    next.add(personId);

    const members = [personId];
    const memberSet = new Set(members);
    const pending = [personId];
    const childList: string[] = [];
    const phantomIds: string[] = [];
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
          if (childSeen.has(childId) || memberSet.has(childId)) continue;
          if (next.has(childId) && childId !== reserve?.id) continue;
          childSeen.add(childId);
          if (visited.has(childId)) {
            if (reserve && childId === reserve.id) phantomIds.push(childId);
            continue;
          }
          childList.push(childId);
        }
      }
    }

    const rowIds = reserve?.side === "start" ? [...phantomIds, ...childList] : [...childList, ...phantomIds];
    const slots: { coreLeft: number; coreRight: number; boxes: Placed[]; phantom?: Phantom }[] = [];
    let childCursor = 0;
    for (const childId of rowIds) {
      if (phantomIds.includes(childId)) {
        const width = reserve?.width ?? CARD_W;
        const left = childCursor;
        slots.push({ coreLeft: left, coreRight: left + width, boxes: [], phantom: { id: childId, x: left } });
        childCursor = left + width + GAP_X;
        continue;
      }
      const span = layoutDown(childId, depth + 1, next);
      if (span.boxes.length === 0) continue;
      const shift = childCursor - span.packLeft;
      slots.push({
        coreLeft: span.left + shift,
        coreRight: span.right + shift,
        boxes: span.boxes.map((box) => ({ ...box, x: box.x + shift })),
      });
      childCursor = span.packRight + shift + GAP_X;
    }

    const membersWidth = members.length * CARD_W + Math.max(0, members.length - 1) * GAP_X;
    const spouses = members.slice(1);
    const ordered = spouses.length > 1 ? [spouses[0], members[0], ...spouses.slice(1)] : members;
    const reserved = reserve ? slots.find((slot) => slot.phantom?.id === reserve.id) : undefined;
    let memberStart = 0;
    if (reserved?.phantom) {
      memberStart = reserved.phantom.x + (reserve?.width ?? CARD_W) / 2 - membersWidth / 2;
    } else if (slots.length > 0) {
      const childrenLeft = Math.min(...slots.map((slot) => slot.coreLeft));
      const childrenRight = Math.max(...slots.map((slot) => slot.coreRight));
      memberStart = (childrenLeft + childrenRight) / 2 - membersWidth / 2;
    }
    const memberBoxes: Placed[] = ordered.map((id, index) => ({
      id,
      x: memberStart + index * (CARD_W + GAP_X),
      y: 0,
      depth,
    }));
    const primaryX = memberBoxes.find((box) => box.id === members[0])?.x ?? memberStart;
    const extra: Placed[] = [];
    for (const box of memberBoxes) {
      const parents = (parentsOf.get(box.id) ?? []).filter((id) => !visited.has(id) && !next.has(id));
      if (parents.length === 0) continue;
      const leftEdge = Math.min(primaryX, box.x);
      const holeLeft = box.x <= primaryX ? leftEdge : box.x;
      const holeWidth = box.x <= primaryX ? primaryX + CARD_W - leftEdge : CARD_W;
      const side: Reserve["side"] = box.x <= primaryX ? "end" : "start";
      extra.push(...layoutAncestors(box.id, holeLeft, holeWidth, depth, next, side));
    }
    const all = [...memberBoxes, ...slots.flatMap((slot) => slot.boxes), ...extra];
    let left = memberStart;
    let right = memberStart + membersWidth;
    for (const slot of slots) {
      left = Math.min(left, slot.coreLeft);
      right = Math.max(right, slot.coreRight);
    }
    let packLeft = left;
    let packRight = right;
    for (const box of all) {
      packLeft = Math.min(packLeft, box.x);
      packRight = Math.max(packRight, box.x + CARD_W);
    }
    return {
      left,
      right,
      packLeft,
      packRight,
      boxes: all,
      phantoms: slots.flatMap((slot) => (slot.phantom ? [slot.phantom] : [])),
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
  openDepths(placedList, unions, kidsByUnion);
  const minDepth = placedList.reduce((min, box) => Math.min(min, box.depth), 0);
  if (minDepth < 0) for (const box of placedList) box.depth -= minDepth;
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
  const lineage = familyLineColors(unions, children);
  function busY(gap: number, lane: number) {
    const top = (genY[gap] ?? 16) + (heightAt.get(gap) ?? CARD_H) + BAND_PAD;
    return top + lane * LANE;
  }
  function addRoute(points: TreePoint[], kind: Route["kind"], status?: UnionStatus, color?: string) {
    const route = routeOf(points, kind, status, color);
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
      const kidColors = kids.map((kid) => lineage.get(kid.id));
      const shared = kidColors.every((color) => color && color === kidColors[0]) ? kidColors[0] : undefined;
      addRoute(
        [
          { x: anchor.x, y: anchor.y },
          { x: anchor.x, y },
        ],
        "child",
        undefined,
        shared,
      );
      if (right - left > 1) {
        addRoute(
          [
            { x: left, y },
            { x: right, y },
          ],
          "child",
          undefined,
          shared,
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
          undefined,
          lineage.get(kid.id),
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

type Route = { points: TreePoint[]; kind: TreeLine["kind"]; status?: UnionStatus; color?: string };

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

function routeOf(points: TreePoint[], kind: Route["kind"], status?: UnionStatus, color?: string): Route {
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
  return { points: next, kind, status, color };
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
    color: route.color,
  };
}

/** Each spouse who has ancestors in the tree gets a color, shared with the ancestors above them. */
export function familyLineColors(unions: FamilyUnion[], children: FamilyChild[]) {
  const parentsOf = new Map<string, string[]>();
  const linksByUnion = new Map<string, FamilyChild[]>();
  for (const link of children) {
    const list = linksByUnion.get(link.union_id) ?? [];
    list.push(link);
    linksByUnion.set(link.union_id, list);
  }
  for (const union of unions) {
    const parents = [union.partner_a, union.partner_b].filter((id): id is string => Boolean(id));
    for (const link of linksByUnion.get(union.id) ?? []) {
      const list = parentsOf.get(link.person_id) ?? [];
      for (const parent of parents) if (!list.includes(parent)) list.push(parent);
      parentsOf.set(link.person_id, list);
    }
  }
  const depthOf = new Map<string, number>();
  const ancestorDepth = (id: string, stack: Set<string>): number => {
    const cached = depthOf.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0;
    const parents = parentsOf.get(id) ?? [];
    if (parents.length === 0) {
      depthOf.set(id, 0);
      return 0;
    }
    stack.add(id);
    let depth = 0;
    for (const parent of parents) depth = Math.max(depth, ancestorDepth(parent, stack));
    stack.delete(id);
    const value = depth + 1;
    depthOf.set(id, value);
    return value;
  };
  const paintUp = (id: string, value: string) => {
    const stack = new Set<string>([id]);
    const walk = (current: string) => {
      for (const parent of parentsOf.get(current) ?? []) {
        if (stack.has(parent) || color.has(parent)) continue;
        stack.add(parent);
        color.set(parent, value);
        walk(parent);
      }
    };
    walk(id);
  };
  const color = new Map<string, string>();
  let cursor = 0;
  const take = () => {
    const value = FAMILY_LINE_COLORS[cursor % FAMILY_LINE_COLORS.length];
    cursor += 1;
    return value;
  };
  const couples = unions.filter((union) => union.partner_a && union.partner_b && parentsOf.has(union.partner_a) && parentsOf.has(union.partner_b));
  couples.sort((a, b) => {
    const left = Math.max(ancestorDepth(a.partner_a, new Set()), ancestorDepth(a.partner_b ?? "", new Set()));
    const right = Math.max(ancestorDepth(b.partner_a, new Set()), ancestorDepth(b.partner_b ?? "", new Set()));
    return right - left;
  });
  for (const union of couples) {
    const first = union.partner_a;
    const second = union.partner_b ?? "";
    let firstColor = color.get(first);
    let secondColor = color.get(second);
    if (!firstColor) {
      firstColor = take();
      color.set(first, firstColor);
    }
    if (!secondColor || secondColor === firstColor) {
      secondColor = take();
      if (secondColor === firstColor) secondColor = take();
      color.set(second, secondColor);
    }
    paintUp(first, firstColor);
    paintUp(second, secondColor);
  }
  return color;
}

function parentMap(boxes: Placed[], unions: FamilyUnion[], kidsByUnion: Map<string, FamilyChild[]>) {
  const known = new Set(boxes.map((box) => box.id));
  const parentsOf = new Map<string, string[]>();
  for (const union of unions) {
    const parents = [union.partner_a, union.partner_b].filter((id): id is string => Boolean(id && known.has(id)));
    for (const link of kidsByUnion.get(union.id) ?? []) {
      if (!known.has(link.person_id)) continue;
      const list = parentsOf.get(link.person_id) ?? [];
      for (const parent of parents) if (!list.includes(parent)) list.push(parent);
      parentsOf.set(link.person_id, list);
    }
  }
  return parentsOf;
}

function rangesOverlap(a: Placed, b: Placed) {
  return a.id !== b.id && a.depth === b.depth && a.x < b.x + CARD_W + GAP_X && b.x < a.x + CARD_W + GAP_X;
}

function liftCrowdedParents(boxes: Placed[], unions: FamilyUnion[], kidsByUnion: Map<string, FamilyChild[]>) {
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const parentsOf = parentMap(boxes, unions, kidsByUnion);
  let guard = 24;
  while (guard-- > 0) {
    let lifted = false;
    for (const child of boxes) {
      const parents = (parentsOf.get(child.id) ?? []).map((id) => byId.get(id)).filter((box): box is Placed => Boolean(box));
      if (parents.length === 0) continue;
      const parentIds = new Set(parents.map((box) => box.id));
      const crowded = parents.some((parent) => boxes.some((other) => rangesOverlap(parent, other) && !parentIds.has(other.id)));
      if (!crowded) continue;
      const seen = new Set<string>();
      const queue = [...parentIds];
      while (queue.length > 0) {
        const id = queue.shift() ?? "";
        if (seen.has(id)) continue;
        seen.add(id);
        const ancestor = byId.get(id);
        if (ancestor) ancestor.depth -= 1;
        for (const up of parentsOf.get(id) ?? []) queue.push(up);
        for (const union of unions) {
          const other = union.partner_a === id ? union.partner_b : union.partner_b === id ? union.partner_a : null;
          if (other && byId.has(other)) queue.push(other);
        }
      }
      lifted = true;
      break;
    }
    if (!lifted) break;
  }
  let min = 0;
  for (const box of boxes) min = Math.min(min, box.depth);
  if (min !== 0) for (const box of boxes) box.depth -= min;
}

function openDepths(boxes: Placed[], unions: FamilyUnion[], kidsByUnion: Map<string, FamilyChild[]>) {
  if (boxes.length === 0) return;
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const parentsOf = new Map<string, string[]>();
  for (const union of unions) {
    const parents = [union.partner_a, union.partner_b].filter((id): id is string => Boolean(id && byId.has(id)));
    for (const link of kidsByUnion.get(union.id) ?? []) {
      if (!byId.has(link.person_id)) continue;
      const kids = parentsOf.get(link.person_id) ?? [];
      for (const parent of parents) if (!kids.includes(parent)) kids.push(parent);
      parentsOf.set(link.person_id, kids);
    }
  }
  const cap = boxes.length;
  const normalize = () => {
    let min = 0;
    for (const box of boxes) min = Math.min(min, box.depth);
    if (min !== 0) for (const box of boxes) box.depth -= min;
  };
  normalize();
  let guard = cap + 2;
  let changed = true;
  while (changed && guard-- > 0) {
    changed = false;
    for (const [childId, parents] of parentsOf) {
      const child = byId.get(childId);
      if (!child || parents.length === 0) continue;
      const need = Math.min(cap, Math.max(...parents.map((id) => byId.get(id)?.depth ?? 0)) + 1);
      if (child.depth < need) {
        child.depth = need;
        changed = true;
      }
    }
    for (const union of unions) {
      const first = union.partner_a ? byId.get(union.partner_a) : undefined;
      const second = union.partner_b ? byId.get(union.partner_b) : undefined;
      if (!first || !second || first.depth === second.depth) continue;
      const target = Math.min(cap, Math.max(first.depth, second.depth));
      if (first.depth !== target) {
        first.depth = target;
        changed = true;
      }
      if (second.depth !== target) {
        second.depth = target;
        changed = true;
      }
    }
  }
  normalize();
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
