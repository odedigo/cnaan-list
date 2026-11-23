"use client";

/** Draws a family tree with family-chart. The chart data comes from a GEDCOM file. */

import { useEffect, useRef, useState } from "react";
import "family-chart/styles/family-chart.css";

import { FamilyPersonSheet, type PersonCard } from "@/components/family-person-sheet";
import { ChevronIcon, SearchIcon } from "@/components/icons";
import { gedcomText, parseGedcom, plainNote, type GedcomTree, type GedcomUnion } from "@/lib/gedcom";
import type { FamilyPerson, PersonDraft, UnionStatus } from "@/lib/family-trees";
import { lockScreenOrientation } from "@/lib/screen-orientation";

type ChartPerson = {
  id: string;
  data: {
    gender: "M" | "F";
    "first name": string;
    "last name": string;
        birthday: string;
        deceased: boolean;
      };
  rels: {
    parents: string[];
    spouses: string[];
    children: string[];
  };
};

type PersonHit = { id: string; label: string };

type ChartDatum = {
  id: string;
  data: { gender: "M" | "F"; [key: string]: unknown };
  rels: { parents: string[]; spouses: string[]; children: string[] };
  to_add?: boolean;
};

type TreeNode = { x?: number; y?: number; _x?: number; _y?: number; depth?: number; tid?: string; data?: ChartDatum };

type ChartJump = {
  updateMainId: (id: string) => void;
  updateTree: (props: { initial: boolean; tree_position: "main_to_middle" | "inherit"; transition_time: number }) => void;
  setBeforeUpdate: (fn: () => void) => void;
  setAfterUpdate: (fn: () => void) => void;
  store: {
    getData: () => ChartDatum[];
    getMainId: () => string;
    getTree: () => { data: TreeNode[] } | undefined;
  };
};

type ChartLayout = {
  calculateTree: (data: ChartDatum[], options: { main_id: string; single_parent_empty_card: boolean }) => { data: { x?: number; y?: number; data?: { id?: string } }[] };
};

export function FamilyChartView({
  name,
  bytes,
  sourceKey,
  loading,
  error,
  onBack,
  onCommit,
}: {
  name: string;
  bytes: Uint8Array | null;
  sourceKey: string;
  loading: boolean;
  error: string;
  onBack: () => void;
  onCommit?: (text: string) => Promise<void>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartJump | null>(null);
  const bytesRef = useRef(bytes);
  const persistRef = useRef(onCommit);
  const recordsRef = useRef<PersonCard[]>([]);
  const spousesRef = useRef<Record<string, SpouseTie[]>>({});
  const openCardRef = useRef<(xref: string) => void>(() => {});
  const looseAnchorRef = useRef<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [records, setRecords] = useState<PersonCard[]>([]);
  const [spouses, setSpouses] = useState<Record<string, SpouseTie[]>>({});
  const [openXref, setOpenXref] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  bytesRef.current = bytes;
  persistRef.current = onCommit;
  recordsRef.current = records;
  spousesRef.current = spouses;
  openCardRef.current = (xref) => setOpenXref(xref);
  const loadKey = bytes && sourceKey ? sourceKey : "";

  useEffect(() => {
    document.documentElement.dataset.allowLandscape = "1";
    lockScreenOrientation("landscape");
    return () => {
      delete document.documentElement.dataset.allowLandscape;
      lockScreenOrientation("portrait");
    };
  }, []);

  useEffect(() => {
    const node = box.current;
    const file = bytesRef.current;
    if (!node || !file || !loadKey) return;
    let cancel = false;
    setEmpty(false);
    setDrawError("");
    setQuery("");
    setSearchOpen(false);
    setListOpen(false);
    setOpenXref(null);
    chartRef.current = null;
    node.replaceChildren();
    if (file.length === 0) {
      recordsRef.current = [];
      spousesRef.current = {};
      setPeople([]);
      setRecords([]);
      setSpouses({});
      setEmpty(true);
      return;
    }
    let parsed: GedcomTree;
    try {
      parsed = parseGedcom(file);
    } catch (reason) {
      recordsRef.current = [];
      spousesRef.current = {};
      setPeople([]);
      setRecords([]);
      setSpouses({});
      setDrawError(reason instanceof Error && reason.message ? reason.message : "לא ניתן לצייר את העץ");
      return;
    }
    const data = chartPeople(parsed);
    const cards = personCards(parsed, Boolean(persistRef.current));
    const ties = spouseMap(parsed);
    recordsRef.current = cards;
    spousesRef.current = ties;
    if (data.length === 0) {
      setPeople([]);
      setRecords([]);
      setSpouses({});
      setEmpty(true);
      return;
    }
    setRecords(cards);
    setSpouses(ties);
    setPeople(data.map((person) => ({ id: person.id, label: personLabel(person.data) })));
    void import("family-chart")
      .then((f3) => {
        if (cancel || !box.current) return;
        const chart = f3.createChart(box.current, data);
        chart.setCardHtml().setMiniTree(true).setCardDisplay([
          ["first name", "last name"],
          ["birthday"],
        ]).setOnCardUpdate(function (this: HTMLElement, datum: { data: { data: { deceased?: boolean } } }) {
          this.querySelector(".card")?.classList.toggle("card-deceased", Boolean(datum.data.data.deceased));
        }).setOnCardClick((event: MouseEvent, datum: { data: { id: string } }) => {
          const target = event.target;
          if (target instanceof Element && target.closest(".mini-tree")) {
            chart.updateMainId(datum.data.id);
            chart.updateTree({ initial: false, tree_position: "main_to_middle", transition_time: 400 });
            return;
          }
          openCardRef.current(datum.data.id);
        });
        chart.setBeforeUpdate(() => attachLoosePeople(chart, f3, looseAnchorRef.current));
        chart.setAfterUpdate(() => drawLooseLinks(box.current, chart));
        chartRef.current = chart;
        chart.updateTree({ initial: true });
      })
      .catch((reason: unknown) => {
        if (!cancel) setDrawError(reason instanceof Error && reason.message ? reason.message : "לא ניתן לצייר את העץ");
      });
    return () => {
      cancel = true;
      chartRef.current = null;
      node.replaceChildren();
    };
  }, [loadKey]);

  const matches = matchingPeople(people, query);
  const openPerson = records.find((row) => row.xref === openXref) ?? null;

  function applyDraft(xref: string, draft: PersonDraft) {
    const next = recordsRef.current.map((row) => (row.xref === xref ? { ...row, ...draft } : row));
    recordsRef.current = next;
    setRecords(next);
    setPeople((current) => current.map((row) => (row.id === xref ? { ...row, label: labelOf(draft) } : row)));
    const chart = chartRef.current;
    const row = chart?.store.getData().find((item) => item.id === xref);
    if (!chart || !row) return;
    row.data.gender = draft.sex === "f" ? "F" : "M";
    row.data["first name"] = draft.given_name || draft.hebrew_given;
    row.data["last name"] = draft.surname || draft.hebrew_surname;
    row.data.birthday = draft.birth_date;
    row.data.deceased = draft.deceased || Boolean(draft.death_date.trim());
    chart.updateTree({ initial: false, tree_position: "inherit", transition_time: 0 });
  }

  function chartIdFor(personId: string) {
    return recordsRef.current.find((row) => row.personId === personId)?.xref ?? personId;
  }

  function rememberPerson(person: FamilyPerson) {
    const xref = chartIdFor(person.id);
    const card = cardFromPerson(person, xref, Boolean(persistRef.current));
    if (!recordsRef.current.some((row) => row.xref === xref)) {
      recordsRef.current = [...recordsRef.current, card];
      setRecords(recordsRef.current);
    }
    setPeople((current) => (current.some((row) => row.id === xref) ? current : [...current, { id: xref, label: labelOf(card) }]));
    const data = chartRef.current?.store.getData();
    if (data && !data.some((row) => row.id === xref)) {
      data.push({
        id: xref,
        data: {
          gender: person.sex === "f" ? "F" : "M",
          "first name": person.given_name || person.hebrew_given,
          "last name": person.surname || person.hebrew_surname,
          birthday: person.birth_date,
          deceased: person.deceased || Boolean(person.death_date.trim()),
        },
        rels: { parents: [], spouses: [], children: [] },
      });
    }
    return xref;
  }

  function showAround(xref: string) {
    const chart = chartRef.current;
    if (!chart) return;
    chart.updateMainId(xref);
    chart.updateTree({ initial: false, tree_position: "main_to_middle", transition_time: 400 });
  }

  async function addChild(person: PersonCard) {
    const childId = rememberPerson(blankRelative());
    const data = chartRef.current?.store.getData() ?? [];
    const parentIds = [person.xref, spouseOf(person.xref, data)].filter((id): id is string => Boolean(id));
    const child = data.find((row) => row.id === childId);
    for (const parentId of parentIds) {
      if (child) relate(child.rels.parents, parentId);
      const parent = data.find((row) => row.id === parentId);
      if (parent) relate(parent.rels.children, childId);
    }
    relatePair(data, parentIds);
    showAround(person.xref);
    await commit();
  }

  async function addParents(person: PersonCard) {
    const parentIds = [rememberPerson(blankRelative()), rememberPerson(blankRelative())];
    const data = chartRef.current?.store.getData() ?? [];
    const child = data.find((row) => row.id === person.xref);
    for (const parentId of parentIds) {
      if (child) relate(child.rels.parents, parentId);
      const parent = data.find((row) => row.id === parentId);
      if (parent) relate(parent.rels.children, person.xref);
    }
    relatePair(data, parentIds);
    showAround(person.xref);
    await commit();
  }

  async function addSpouse(person: PersonCard, status: UnionStatus) {
    const spouseXref = rememberPerson(blankRelative(status === "widowed"));
    relatePair(chartRef.current?.store.getData() ?? [], [person.xref, spouseXref]);
    const next = tieSpouses(spousesRef.current, person.xref, spouseXref, status, null);
    spousesRef.current = next;
    setSpouses(next);
    showAround(person.xref);
    await commit();
  }

  async function setSpouseStatus(personXref: string, spouseXref: string, status: UnionStatus) {
    const next = tieSpouses(spousesRef.current, personXref, spouseXref, status, null);
    spousesRef.current = next;
    setSpouses(next);
    await commit();
  }

  async function removeConnection(person: PersonCard, otherXref: string, kind: "parent" | "child" | "spouse") {
    const data = chartRef.current?.store.getData() ?? [];
    const left = data.find((row) => row.id === person.xref);
    const right = data.find((row) => row.id === otherXref);
    if (kind === "parent") {
      if (left) cut(left.rels.parents, otherXref);
      if (right) cut(right.rels.children, person.xref);
    } else if (kind === "child") {
      if (left) cut(left.rels.children, otherXref);
      if (right) cut(right.rels.parents, person.xref);
    } else {
      if (left) cut(left.rels.spouses, otherXref);
      if (right) cut(right.rels.spouses, person.xref);
      const next: Record<string, SpouseTie[]> = {};
      for (const [id, ties] of Object.entries(spousesRef.current)) {
        const list = ties.filter((tie) => !((id === person.xref && tie.xref === otherXref) || (id === otherXref && tie.xref === person.xref)));
        if (list.length > 0) next[id] = list;
      }
      spousesRef.current = next;
      setSpouses(next);
    }
    looseAnchorRef.current = person.xref;
    setRecords(recordsRef.current.slice());
    chartRef.current?.updateTree({ initial: false, tree_position: "inherit", transition_time: 0 });
    await commit();
  }

  async function removePerson(person: PersonCard) {
    const chart = chartRef.current;
    const data = chart?.store.getData() ?? [];
    const next = data.filter((row) => row.id !== person.xref && !row.to_add);
    for (const row of next) {
      row.rels.parents = row.rels.parents.filter((id) => id !== person.xref);
      row.rels.spouses = row.rels.spouses.filter((id) => id !== person.xref);
      row.rels.children = row.rels.children.filter((id) => id !== person.xref);
    }
    data.splice(0, data.length, ...next);
    recordsRef.current = recordsRef.current.filter((row) => row.xref !== person.xref);
    setRecords(recordsRef.current);
    setPeople((current) => current.filter((row) => row.id !== person.xref));
    const kept: Record<string, SpouseTie[]> = {};
    for (const [id, ties] of Object.entries(spousesRef.current)) {
      if (id === person.xref) continue;
      const list = ties.filter((tie) => tie.xref !== person.xref);
      if (list.length > 0) kept[id] = list;
    }
    spousesRef.current = kept;
    setSpouses(kept);
    await commit(next);
    setOpenXref(null);
    if (!chart || next.length === 0) {
      chartRef.current = null;
      box.current?.replaceChildren();
      setEmpty(true);
      return;
    }
    if (chart.store.getMainId() === person.xref) chart.updateMainId(next[0].id);
    chart.updateTree({ initial: false, tree_position: "main_to_middle", transition_time: 400 });
  }

  async function commit(rows?: ChartDatum[]) {
    const save = persistRef.current;
    if (!save) return;
    const data = rows ?? chartRef.current?.store.getData() ?? [];
    await save(gedcomFromChart(recordsRef.current, spousesRef.current, data));
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-[80] flex flex-col bg-[var(--cream)] text-neutral-900" role="dialog" aria-modal="true" aria-label={name}>
      <button
        type="button"
        className="absolute top-3 z-30 grid size-11 place-items-center rounded-full bg-white text-neutral-900 shadow"
        style={{ insetInlineStart: "0.75rem" }}
        aria-label="חזרה"
        onClick={() => {
          lockScreenOrientation("portrait");
          onBack();
        }}
      >
        <ChevronIcon className="size-6 rotate-90" />
      </button>
      {people.length > 0 && !error && !drawError ? (
        <div className="absolute top-3 z-30 flex flex-col items-end gap-2" style={{ insetInlineEnd: "0.75rem" }}>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full bg-white text-neutral-900 shadow"
            aria-label="חיפוש"
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open);
              setListOpen(true);
            }}
          >
            <SearchIcon className="size-6" />
          </button>
          {searchOpen ? (
            <div className="w-56">
              <input
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                autoFocus
                placeholder="חיפוש"
                aria-label="חיפוש"
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 shadow"
                style={{ textAlign: "right" }}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setListOpen(true);
                }}
                onFocus={() => setListOpen(true)}
              />
              {listOpen && query.trim() ? (
                <div className="mt-1 max-h-60 overflow-y-auto rounded-xl border border-neutral-300 bg-white shadow-lg">
                  {matches.length === 0 ? <p className="px-3 py-2 text-sm text-neutral-500">אין תוצאות</p> : null}
                  {matches.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className="block w-full px-3 py-2 text-start text-sm hover:bg-[#d7efe9]"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        const id = person.id;
                        setQuery("");
                        setListOpen(false);
                        setSearchOpen(false);
                        window.setTimeout(() => {
                          const chart = chartRef.current;
                          if (!chart) return;
                          chart.updateMainId(id);
                          chart.updateTree({ initial: false, tree_position: "main_to_middle", transition_time: 400 });
                        }, 0);
                      }}
                    >
                      {person.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {error || drawError ? <p className="mx-3 mt-16 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error || drawError}</p> : null}
      {loading ? <p className="px-6 pt-16 text-center text-neutral-500">טוען…</p> : null}
      {!loading && empty ? <p className="px-6 pt-16 text-center text-neutral-500">אין אנשים בקובץ</p> : null}
      <style>{".f3 path.link, .f3 path.loose-link, .f3 .mini-tree line { stroke: #000; fill: none; } .f3 div.card.card-deceased .card-inner { border: 3px solid #000; }"}</style>
      <div ref={box} className="f3 relative min-h-0 flex-1 overflow-hidden" style={{ width: "100%", background: "var(--cream)", color: "#171717" }} />
      {openPerson ? (
        <FamilyPersonSheet
          key={openPerson.xref}
          person={openPerson}
          relatives={relativesOf(openPerson.xref, records, spouses, chartRef.current)}
          onClose={() => setOpenXref(null)}
          onOpenRelative={(xref) => setOpenXref(xref)}
          onAddChild={() => addChild(openPerson)}
          onAddParents={() => addParents(openPerson)}
          onAddSpouse={(status) => addSpouse(openPerson, status)}
          onSetSpouseStatus={(xref, status) => setSpouseStatus(openPerson.xref, xref, status)}
          onRemoveParent={(xref) => removeConnection(openPerson, xref, "parent")}
          onRemoveSpouse={(xref) => removeConnection(openPerson, xref, "spouse")}
          onRemoveChild={(xref) => removeConnection(openPerson, xref, "child")}
          onDelete={() => removePerson(openPerson)}
          onSave={async (draft) => {
            applyDraft(openPerson.xref, draft);
            await commit();
            setOpenXref(null);
          }}
        />
      ) : null}
    </div>
  );
}

function matchingPeople(people: PersonHit[], query: string) {
  const text = query.trim().toLowerCase();
  if (!text) return [];
  const found: PersonHit[] = [];
  for (const person of people) {
    if (!person.label.toLowerCase().includes(text)) continue;
    found.push(person);
    if (found.length === 20) break;
  }
  return found;
}

function personLabel(data: ChartPerson["data"]) {
  const name = `${data["first name"]} ${data["last name"]}`.trim();
  return data.birthday ? `${name} · ${data.birthday}` : name;
}

type SpouseTie = { xref: string; status: UnionStatus; unionId: string | null };

function relativesOf(xref: string, records: PersonCard[], spouses: Record<string, SpouseTie[]>, chart: ChartJump | null) {
  const data = chart?.store.getData() ?? [];
  const row = data.find((item) => item.id === xref);
  const byId = new Map(records.map((record) => [record.xref, record]));
  const named = (ids: string[] | undefined) => (ids ?? []).flatMap((id) => {
    const record = byId.get(id);
    return record ? [{ xref: record.xref, label: labelOf(record) || "ללא שם" }] : [];
  });
  const links = (spouses[xref] ?? []).flatMap((tie) => {
    const record = byId.get(tie.xref);
    return record ? [{ xref: record.xref, label: labelOf(record) || "ללא שם", status: tie.status }] : [];
  });
  const children = (row?.rels.children ?? []).flatMap((id) => {
    const record = byId.get(id);
    if (!record) return [];
    const otherId = data.find((item) => item.id === id)?.rels.parents.find((parentId) => parentId !== xref && data.some((item) => item.id === parentId && !item.to_add));
    const other = otherId ? byId.get(otherId) : undefined;
    return [{ xref: record.xref, label: labelOf(record) || "ללא שם", otherParent: other ? labelOf(other) || "ללא שם" : "" }];
  });
  return { parents: named(row?.rels.parents), spouses: links, children };
}

function spouseMap(tree: GedcomTree) {
  let map: Record<string, SpouseTie[]> = {};
  for (const union of tree.unions) {
    if (!union.partnerA || !union.partnerB || union.partnerA === union.partnerB) continue;
    map = tieSpouses(map, union.partnerA, union.partnerB, union.status, null);
  }
  return map;
}

function tieSpouses(current: Record<string, SpouseTie[]>, left: string, right: string, status: UnionStatus, unionId: string | null) {
  const next = { ...current, [left]: [...(current[left] ?? [])], [right]: [...(current[right] ?? [])] };
  const place = (from: string, to: string) => {
    const list = next[from];
    const index = list.findIndex((item) => item.xref === to);
    const tie = { xref: to, status, unionId };
    if (index >= 0) list[index] = tie;
    else list.push(tie);
  };
  place(left, right);
  place(right, left);
  return next;
}

function cardFromPerson(person: FamilyPerson, xref: string, stored: boolean): PersonCard {
  return {
    xref,
    personId: stored ? xref : null,
    given_name: person.given_name,
    surname: person.surname,
    hebrew_given: person.hebrew_given,
    hebrew_surname: person.hebrew_surname,
    sex: person.sex,
    birth_date: person.birth_date,
    birth_place: person.birth_place,
    death_date: person.death_date,
    death_place: person.death_place,
    note: person.note,
    deceased: person.deceased,
    nickname: person.nickname,
    cause_of_death: person.cause_of_death,
    occupation: person.occupation,
    source: person.source,
    media: person.media,
    address: person.address,
    city: person.city,
    country: person.country,
    email: person.email,
  };
}

function spouseOf(xref: string, data: ChartDatum[]) {
  const person = data.find((row) => row.id === xref);
  return person?.rels.spouses.find((id) => data.some((row) => row.id === id && !row.to_add)) ?? null;
}

function blankRelative(deceased = false): FamilyPerson {
  return {
    id: `@I${crypto.randomUUID().replace(/-/g, "")}@`,
    account_id: "",
    tree_id: "",
    given_name: "",
    surname: "",
    hebrew_given: "",
    hebrew_surname: "",
    sex: "u",
    birth_date: "",
    birth_place: "",
    death_date: "",
    death_place: "",
    note: "",
    deceased,
    nickname: "",
    cause_of_death: "",
    occupation: "",
    source: "",
    media: "",
    address: "",
    city: "",
    country: "",
    email: "",
    image_path: null,
    link_id: null,
  };
}

function attachLoosePeople(chart: ChartJump, layout: ChartLayout, anchorId: string | null) {
  const tree = chart.store.getTree();
  if (!tree) return;
  const shown = new Set(tree.data.map((node) => node.data?.id).filter((id): id is string => Boolean(id)));
  const loose = chart.store.getData().filter((row) => !row.to_add && !shown.has(row.id));
  if (loose.length === 0) return;
  const anchor = tree.data.find((node) => node.data?.id === anchorId) ?? tree.data.find((node) => typeof node.x === "number");
  let cursorY = typeof anchor?.y === "number" ? anchor.y : 0;
  const originX = (typeof anchor?.x === "number" ? anchor.x : 0) + 280;
  for (const group of connectedGroups(loose)) {
    const placed = placeGroup(group, layout);
    let minX = Infinity;
    let minY = Infinity;
    let maxY = cursorY;
    for (const point of placed.values()) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    const dx = originX - minX;
    const dy = cursorY - minY;
    for (const person of group) {
      const point = placed.get(person.id);
      if (!point) continue;
      const x = point.x + dx;
      const y = point.y + dy;
      tree.data.push({ data: person, x, y, _x: x, _y: y, depth: 0, tid: `loose-${person.id}` });
    }
    cursorY += maxY - minY + 180;
  }
}

function drawLooseLinks(root: HTMLElement | null, chart: ChartJump) {
  const links = root?.querySelector("svg .links_view");
  links?.querySelectorAll(".loose-link").forEach((node) => node.remove());
  const tree = chart.store.getTree();
  if (!links || !tree) return;
  const loose = new Map<string, { x: number; y: number; rels: ChartDatum["rels"] }>();
  for (const node of tree.data) {
    if (!node.tid?.startsWith("loose-") || !node.data || typeof node.x !== "number" || typeof node.y !== "number") continue;
    loose.set(node.data.id, { x: node.x, y: node.y, rels: node.data.rels });
  }
  for (const [id, node] of loose) {
    for (const childId of node.rels.children) {
      const child = loose.get(childId);
      if (child) links.append(looseLine(node.x, node.y, child.x, child.y));
    }
    for (const spouseId of node.rels.spouses) {
      if (spouseId <= id) continue;
      const spouse = loose.get(spouseId);
      if (spouse) links.append(looseLine(node.x, node.y, spouse.x, spouse.y));
    }
  }
}

function connectedGroups(rows: ChartDatum[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const groups: ChartDatum[][] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const group: ChartDatum[] = [];
    const stack = [row];
    seen.add(row.id);
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      group.push(current);
      for (const id of [...current.rels.parents, ...current.rels.spouses, ...current.rels.children]) {
        const next = byId.get(id);
        if (!next || seen.has(id)) continue;
        seen.add(id);
        stack.push(next);
      }
    }
    groups.push(group);
  }
  return groups;
}

function placeGroup(group: ChartDatum[], layout: ChartLayout) {
  const ids = new Set(group.map((row) => row.id));
  const copy = group.map((row) => ({
    id: row.id,
    data: { ...row.data },
    rels: {
      parents: row.rels.parents.filter((id) => ids.has(id)),
      spouses: row.rels.spouses.filter((id) => ids.has(id)),
      children: row.rels.children.filter((id) => ids.has(id)),
    },
  }));
  const placed = new Map<string, { x: number; y: number }>();
  try {
    const laid = layout.calculateTree(copy, { main_id: copy[0].id, single_parent_empty_card: false });
    for (const node of laid.data) {
      const id = node.data?.id;
      if (!id || !ids.has(id) || placed.has(id) || typeof node.x !== "number" || typeof node.y !== "number") continue;
      placed.set(id, { x: node.x, y: node.y });
    }
  } catch {
    group.forEach((row, index) => placed.set(row.id, { x: 0, y: index * 150 }));
  }
  group.forEach((row, index) => {
    if (!placed.has(row.id)) placed.set(row.id, { x: 0, y: index * 150 });
  });
  return placed;
}

function looseLine(x1: number, y1: number, x2: number, y2: number) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "loose-link");
  path.setAttribute("d", `M${x1} ${y1} L${x2} ${y2}`);
  return path;
}

function cut(list: string[], id: string) {
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
}

function relate(list: string[], id: string) {
  if (id && !list.includes(id)) list.push(id);
}

function relatePair(data: ChartDatum[], ids: string[]) {
  if (ids.length !== 2) return;
  const [leftId, rightId] = ids;
  const left = data.find((row) => row.id === leftId);
  const right = data.find((row) => row.id === rightId);
  if (!left || !right) return;
  relate(left.rels.spouses, rightId);
  relate(right.rels.spouses, leftId);
}

function labelOf(draft: PersonDraft) {
  const name = `${draft.given_name || draft.hebrew_given} ${draft.surname || draft.hebrew_surname}`.replace(/\s+/g, " ").trim();
  return draft.birth_date ? `${name} · ${draft.birth_date}` : name;
}

function personCards(tree: GedcomTree, stored: boolean): PersonCard[] {
  return tree.people.map((person) => ({
    xref: person.xref,
    personId: stored ? person.xref : null,
    given_name: person.given,
    surname: person.surname,
    hebrew_given: person.hebrewGiven,
    hebrew_surname: person.hebrewSurname,
    sex: person.sex,
    birth_date: person.birthDate,
    birth_place: person.birthPlace,
    death_date: person.deathDate,
    death_place: person.deathPlace,
    note: plainNote(person.note),
    deceased: person.deceased,
    nickname: person.nickname,
    cause_of_death: person.cause,
    occupation: person.occupation,
    source: person.source,
    media: person.media,
    address: person.address,
    city: person.city,
    country: person.country,
    email: person.email,
  }));
}

function gedcomFromChart(records: PersonCard[], spouses: Record<string, SpouseTie[]>, data: ChartDatum[]) {
  const byId = new Map(data.filter((row) => !row.to_add).map((row) => [row.id, row]));
  const unions: GedcomUnion[] = [];
  const placed = new Set<string>();
  const seen = new Set<string>();
  for (const [id, ties] of Object.entries(spouses)) {
    for (const tie of ties) {
      const key = [id, tie.xref].sort().join("\0");
      if (seen.has(key) || !byId.has(id) || !byId.has(tie.xref)) continue;
      seen.add(key);
      const children = sharedChildren(byId, id, tie.xref);
      for (const child of children) {
        placed.add(`${id}|${child}`);
        placed.add(`${tie.xref}|${child}`);
      }
      unions.push({ partnerA: id, partnerB: tie.xref, children, status: tie.status });
    }
  }
  for (const [parent, row] of byId) {
    const children = row.rels.children.filter((id) => {
      const parents = byId.get(id)?.rels.parents ?? [];
      return byId.has(id) && parents.includes(parent) && !placed.has(`${parent}|${id}`);
    });
    if (children.length > 0) unions.push({ partnerA: parent, partnerB: null, children, status: "married" });
  }
  return gedcomText({
    people: records.flatMap((person) => byId.has(person.xref) ? [{
      xref: person.xref,
      given: person.given_name,
      surname: person.surname,
      hebrewGiven: person.hebrew_given,
      hebrewSurname: person.hebrew_surname,
      sex: person.sex,
      birthDate: person.birth_date,
      birthPlace: person.birth_place,
      deathDate: person.death_date,
      deathPlace: person.death_place,
      deceased: person.deceased || Boolean(person.death_date.trim()),
      note: person.note,
      nickname: person.nickname,
      cause: person.cause_of_death,
      occupation: person.occupation,
      source: person.source,
      media: person.media,
      address: person.address,
      city: person.city,
      country: person.country,
      email: person.email,
    }] : []),
    unions,
  });
}

function sharedChildren(byId: Map<string, ChartDatum>, left: string, right: string) {
  return (byId.get(left)?.rels.children ?? []).filter((id) => {
    const parents = byId.get(id)?.rels.parents ?? [];
    return parents.includes(left) && parents.includes(right);
  });
}

function chartPeople(tree: GedcomTree): ChartPerson[] {
  const people = new Map<string, ChartPerson>();
  for (const person of tree.people) {
    people.set(person.xref, {
      id: person.xref,
      data: {
        gender: person.sex === "f" ? "F" : "M",
        "first name": person.given || person.hebrewGiven,
        "last name": person.surname || person.hebrewSurname,
        birthday: person.birthDate,
        deceased: person.deceased || Boolean(person.deathDate.trim()),
      },
      rels: { parents: [], spouses: [], children: [] },
    });
  }
  for (const union of tree.unions) {
    const partners = [union.partnerA, union.partnerB].filter((id): id is string => Boolean(id && people.has(id)));
    if (partners.length === 2) {
      add(people.get(partners[0])?.rels.spouses, partners[1]);
      add(people.get(partners[1])?.rels.spouses, partners[0]);
    }
    for (const child of union.children) {
      const row = people.get(child);
      if (!row) continue;
      for (const parent of partners) {
        add(row.rels.parents, parent);
        add(people.get(parent)?.rels.children, child);
      }
    }
  }
  return [...people.values()];
}

function add(list: string[] | undefined, id: string) {
  if (list && !list.includes(id)) list.push(id);
}
