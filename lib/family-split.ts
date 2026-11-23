/** Splits one GEDCOM into a tree per ancestral family. */

import type { GedcomPerson, GedcomTree, GedcomUnion } from "@/lib/gedcom";

export type FamilySlice = {
  name: string;
  people: GedcomPerson[];
  unions: GedcomUnion[];
  linked: string[];
};

export function splitFamilies(tree: GedcomTree, baseName: string): FamilySlice[] {
  const byXref = new Map(tree.people.map((person) => [person.xref, person]));
  const parentsOf = new Map<string, string[]>();
  for (const union of tree.unions) {
    const parents = [union.partnerA, union.partnerB].filter((id): id is string => Boolean(id && byXref.has(id)));
    for (const child of union.children) {
      if (!byXref.has(child)) continue;
      const list = parentsOf.get(child) ?? [];
      for (const parent of parents) if (!list.includes(parent)) list.push(parent);
      parentsOf.set(child, list);
    }
  }

  const depthOf = new Map<string, number>();
  const depth = (id: string, stack: Set<string>): number => {
    const cached = depthOf.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0;
    const parents = parentsOf.get(id) ?? [];
    if (parents.length === 0) {
      depthOf.set(id, 0);
      return 0;
    }
    stack.add(id);
    let value = 0;
    for (const parent of parents) value = Math.max(value, depth(parent, stack));
    stack.delete(id);
    depthOf.set(id, value + 1);
    return value + 1;
  };
  for (const person of tree.people) depth(person.xref, new Set());

  const familyOf = new Map<string, string>();
  const size = new Map<string, number>();
  const prefer = (left: string, right: string) => {
    const leftSize = size.get(left) ?? 0;
    const rightSize = size.get(right) ?? 0;
    if (leftSize !== rightSize) return leftSize > rightSize ? left : right;
    return left < right ? left : right;
  };
  const ordered = [...tree.people].sort((a, b) => (depthOf.get(a.xref) ?? 0) - (depthOf.get(b.xref) ?? 0) || a.xref.localeCompare(b.xref));
  for (const person of ordered) {
    const parents = parentsOf.get(person.xref) ?? [];
    if (parents.length === 0) {
      familyOf.set(person.xref, person.xref);
      size.set(person.xref, (size.get(person.xref) ?? 0) + 1);
      continue;
    }
    let family = familyOf.get(parents[0]) ?? parents[0];
    for (const parent of parents.slice(1)) family = prefer(family, familyOf.get(parent) ?? parent);
    familyOf.set(person.xref, family);
    size.set(family, (size.get(family) ?? 0) + 1);
  }

  const kept = new Set<string>();
  for (const [family, count] of size) if (count >= 2) kept.add(family);
  if (kept.size === 0) {
    return [{ name: clip(baseName || "עץ משפחה", 80), people: tree.people, unions: tree.unions, linked: [] }];
  }

  const members = new Map<string, Set<string>>();
  for (const family of kept) members.set(family, new Set());
  for (const [person, family] of familyOf) if (kept.has(family)) members.get(family)?.add(person);
  for (const [child, parents] of parentsOf) {
    const family = familyOf.get(child);
    const home = family ? members.get(family) : undefined;
    if (!home) continue;
    for (const parent of parents) if ((parentsOf.get(parent) ?? []).length === 0) home.add(parent);
  }

  let main = [...kept][0] ?? "";
  for (const family of kept) if ((size.get(family) ?? 0) > (size.get(main) ?? 0)) main = family;
  const source = members.get(main);
  const sourceSide = new Set(source ?? []);
  const linked = new Set<string>();
  const sharedChildren = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const union of tree.unions) {
      const pair = [union.partnerA, union.partnerB].filter((id): id is string => Boolean(id && byXref.has(id)));
      if (pair.length === 2 && (parentsOf.get(pair[0]) ?? []).length > 0 && (parentsOf.get(pair[1]) ?? []).length > 0) {
        const left = familyOf.get(pair[0]) ?? pair[0];
        const right = familyOf.get(pair[1]) ?? pair[1];
        if (left !== right && kept.has(left) && kept.has(right)) {
          const insider = sourceSide.has(pair[0]) ? (sourceSide.has(pair[1]) ? "" : pair[0]) : sourceSide.has(pair[1]) ? pair[1] : "";
          if (insider) {
            const outsider = pair[0] === insider ? pair[1] : pair[0];
            if (source && !source.has(outsider)) {
              source.add(outsider);
              grew = true;
            }
            for (const child of union.children) {
              if (!byXref.has(child) || !source) continue;
              if (!source.has(child)) {
                source.add(child);
                grew = true;
              }
              if (!sourceSide.has(child)) {
                sourceSide.add(child);
                grew = true;
              }
            }
          }
        }
      }
      for (const person of pair) {
        if ((parentsOf.get(person) ?? []).length > 0) continue;
        const other = pair.find((id) => id !== person);
        const family = other ? familyOf.get(other) : undefined;
        if (family && members.has(family)) members.get(family)?.add(person);
      }
    }
  }
  for (const union of tree.unions) {
    const pair = [union.partnerA, union.partnerB].filter((id): id is string => Boolean(id && byXref.has(id)));
    if (pair.length !== 2 || sourceSide.has(pair[0]) || sourceSide.has(pair[1])) continue;
    if ((parentsOf.get(pair[0]) ?? []).length === 0 || (parentsOf.get(pair[1]) ?? []).length === 0) continue;
    const left = familyOf.get(pair[0]) ?? pair[0];
    const right = familyOf.get(pair[1]) ?? pair[1];
    if (left === right || !kept.has(left) || !kept.has(right)) continue;
    for (const home of [members.get(left), members.get(right)]) {
      if (!home) continue;
      home.add(pair[0]);
      home.add(pair[1]);
      for (const child of union.children) if (byXref.has(child)) home.add(child);
    }
    for (const child of union.children) if (byXref.has(child)) sharedChildren.add(child);
  }
  for (const union of tree.unions) {
    const pair = [union.partnerA, union.partnerB].filter((id): id is string => Boolean(id && byXref.has(id)));
    if (pair.length !== 2) continue;
    const bare = pair.filter((id) => (parentsOf.get(id) ?? []).length === 0);
    const rooted = pair.filter((id) => (parentsOf.get(id) ?? []).length > 0);
    if (bare.length !== 1 || rooted.length !== 1 || !sourceSide.has(rooted[0])) continue;
    const spouse = bare[0];
    const home = members.get(spouse) ?? new Set<string>();
    if (!members.has(spouse)) {
      members.set(spouse, home);
      kept.add(spouse);
    }
    home.add(spouse);
    if (source) source.add(spouse);
    for (const child of union.children) {
      if (!byXref.has(child)) continue;
      home.add(child);
      source?.add(child);
      sourceSide.add(child);
    }
  }
  for (const union of tree.unions) {
    const partners = [union.partnerA, union.partnerB].filter((id): id is string => Boolean(id && byXref.has(id)));
    if (partners.length < 2) continue;
    for (const person of partners) {
      if (!sharedChildren.has(person)) continue;
      const spouse = partners.find((id) => id !== person);
      if (!spouse || sourceSide.has(spouse)) continue;
      const homes = [...members.values()].filter((home) => home.has(person));
      if (homes.length < 2) continue;
      for (const home of homes) home.add(spouse);
      linked.add(spouse);
    }
  }
  if (source) {
    const unionsOf = new Map<string, GedcomUnion[]>();
    for (const union of tree.unions) {
      for (const id of [union.partnerA, union.partnerB]) {
        if (!id || !byXref.has(id)) continue;
        const list = unionsOf.get(id) ?? [];
        list.push(union);
        unionsOf.set(id, list);
      }
    }
    const addToSource = (person: string) => {
      if (!byXref.has(person) || source.has(person)) return;
      const already = [...members.values()].some((home) => home.has(person));
      source.add(person);
      if (already) linked.add(person);
    };
    const seen = new Set<string>();
    const queue = [...source];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      for (const union of unionsOf.get(id) ?? []) {
        const spouse = [union.partnerA, union.partnerB].find((partner) => partner && partner !== id && byXref.has(partner));
        if (spouse) addToSource(spouse);
        for (const child of union.children) {
          if (!byXref.has(child)) continue;
          addToSource(child);
          queue.push(child);
        }
      }
    }
  }
  linked.clear();
  const homesOf = new Map<string, number>();
  for (const home of members.values()) {
    for (const id of home) homesOf.set(id, (homesOf.get(id) ?? 0) + 1);
  }
  for (const [id, count] of homesOf) if (count >= 2) linked.add(id);

  const largest = members.get(main);
  if (largest) {
    for (const person of tree.people) {
      const placed = [...members.values()].some((group) => group.has(person.xref));
      if (!placed) largest.add(person.xref);
    }
  }

  const used = new Set<string>();
  const slices: FamilySlice[] = [];
  const families = [...kept].sort((a, b) => (size.get(b) ?? 0) - (size.get(a) ?? 0) || a.localeCompare(b));
  for (const family of families) {
    const ids = members.get(family);
    if (!ids || ids.size === 0) continue;
    const people = tree.people.filter((person) => ids.has(person.xref));
    const unions = tree.unions.flatMap((union) => {
      const partnerA = union.partnerA && ids.has(union.partnerA) ? union.partnerA : null;
      const partnerB = union.partnerB && ids.has(union.partnerB) ? union.partnerB : null;
      if (!partnerA && !partnerB) return [];
      const children = union.children.filter((id) => ids.has(id));
      return [{ ...union, partnerA, partnerB, children }];
    });
    const name = family === main ? clip(baseName || "עץ משפחה", 80) : familyTitle(people.filter((person) => !linked.has(person.xref) || (familyOf.get(person.xref) ?? person.xref) === family), used);
    slices.push({ name, people, unions, linked: people.filter((person) => linked.has(person.xref)).map((person) => person.xref) });
  }
  return slices.length > 0 ? slices : [{ name: clip(baseName || "עץ משפחה", 80), people: tree.people, unions: tree.unions, linked: [] }];
}

function familyTitle(people: GedcomPerson[], used: Set<string>) {
  const counts = new Map<string, number>();
  for (const person of people) {
    const surname = (person.hebrewSurname || person.surname).trim();
    if (!surname) continue;
    counts.set(surname, (counts.get(surname) ?? 0) + 1);
  }
  let surname = "";
  let best = 0;
  for (const [label, count] of counts) {
    if (count > best) {
      surname = label;
      best = count;
    }
  }
  const given = people.find((person) => (person.hebrewGiven || person.given).trim())?.hebrewGiven || people.find((person) => person.given.trim())?.given || "";
  let name = clip(surname ? `משפחת ${surname}` : given.trim() ? `משפחת ${given.trim()}` : "משפחה", 80);
  if (used.has(name) && given.trim()) name = clip(`${name} ${given.trim()}`, 80);
  let extra = 2;
  while (used.has(name)) {
    name = clip(`${surname ? `משפחת ${surname}` : "משפחה"} ${extra}`, 80);
    extra += 1;
  }
  used.add(name);
  return name;
}

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}
