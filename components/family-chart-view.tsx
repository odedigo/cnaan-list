"use client";

/** Draws a family tree with family-chart. The chart data comes from a GEDCOM file. */

import { useCallback, useEffect, useRef, useState } from "react";
import "family-chart/styles/family-chart.css";

import { FamilyPersonSheet, type PersonCard } from "@/components/family-person-sheet";
import { ChevronIcon, SearchIcon } from "@/components/icons";
import { familyAbove, gedcomText, parseGedcom, plainNote, type GedcomPerson, type GedcomTree, type GedcomUnion } from "@/lib/gedcom";
import type { FamilyPerson, FamilyPhoto, PersonDraft, UnionStatus } from "@/lib/family-trees";
import { shrinkImage } from "@/lib/images";
import { lockScreenOrientation } from "@/lib/screen-orientation";

type ChartPerson = {
  id: string;
  data: {
    gender: "M" | "F";
    "first name": string;
    "last name": string;
        birthday: string;
        deceased: boolean;
        avatar?: string;
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
  setCardXSpacing: (value: number) => void;
  setCardYSpacing: (value: number) => void;
  setBeforeUpdate: (fn: () => void) => void;
  setAfterUpdate: (fn: () => void) => void;
  store: {
    getData: () => ChartDatum[];
    getMainId: () => string;
    getTree: () => { data: TreeNode[] } | undefined;
  };
};

type CardSpacing = { x: number; y: number };

type ChartLayout = {
  calculateTree: (data: ChartDatum[], options: { main_id: string; single_parent_empty_card: boolean; node_separation: number; level_separation: number }) => { data: { x?: number; y?: number; data?: { id?: string } }[] };
};

const DEFAULT_SPACING: CardSpacing = { x: 320, y: 220 };

export function FamilyChartView({
  name,
  bytes,
  sourceKey,
  loading,
  error,
  onBack,
  onCommit,
  otherTrees,
  onLoadGedcom,
  onLoadPhotos,
  onAddPhoto,
  onSetThumbnail,
  onDeletePhoto,
  onDeletePersonPhotos,
}: {
  name: string;
  bytes: Uint8Array | null;
  sourceKey: string;
  loading: boolean;
  error: string;
  onBack: () => void;
  onCommit?: (text: string) => Promise<void>;
  otherTrees: { id: string; name: string }[];
  onLoadGedcom: (treeId: string) => Promise<string>;
  onLoadPhotos: (treeId: string) => Promise<FamilyPhoto[]>;
  onAddPhoto: (xref: string, contentType: string, data: string, thumbnail: boolean) => Promise<FamilyPhoto>;
  onSetThumbnail: (xref: string, photoId: string) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
  onDeletePersonPhotos: (xrefs: string[]) => Promise<void>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartJump | null>(null);
  const bytesRef = useRef(bytes);
  const persistRef = useRef(onCommit);
  const loadGedcomRef = useRef(onLoadGedcom);
  const loadPhotosRef = useRef(onLoadPhotos);
  const addPhotoRef = useRef(onAddPhoto);
  const setThumbnailRef = useRef(onSetThumbnail);
  const deletePhotoRef = useRef(onDeletePhoto);
  const deletePhotosRef = useRef(onDeletePersonPhotos);
  const sourceKeyRef = useRef(sourceKey);
  loadGedcomRef.current = onLoadGedcom;
  loadPhotosRef.current = onLoadPhotos;
  addPhotoRef.current = onAddPhoto;
  setThumbnailRef.current = onSetThumbnail;
  deletePhotoRef.current = onDeletePhoto;
  deletePhotosRef.current = onDeletePersonPhotos;
  sourceKeyRef.current = sourceKey;
  const recordsRef = useRef<PersonCard[]>([]);
  const spousesRef = useRef<Record<string, SpouseTie[]>>({});
  const openCardRef = useRef<(xref: string) => void>(() => {});
  const looseAnchorRef = useRef<string | null>(null);
  const photosRef = useRef<FamilyPhoto[]>([]);
  const [empty, setEmpty] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [records, setRecords] = useState<PersonCard[]>([]);
  const [spouses, setSpouses] = useState<Record<string, SpouseTie[]>>({});
  const [openXref, setOpenXref] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [trail, setTrail] = useState<string[]>([]);
  const [photos, setPhotos] = useState<FamilyPhoto[]>([]);
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
    setTrail([]);
    photosRef.current = [];
    setPhotos([]);
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
    const treeId = sourceKeyRef.current;
    void Promise.all([
      import("family-chart"),
      loadPhotosRef.current(treeId).catch(() => [] as FamilyPhoto[]),
    ])
      .then(([f3, loaded]) => {
        if (cancel || !box.current) return;
        photosRef.current = markThumbnails(loaded);
        setPhotos(photosRef.current);
        applyPortraits(data, photosRef.current);
        const chart = f3.createChart(box.current, data);
        let blood = new Set<string>();
        chart.setCardXSpacing(DEFAULT_SPACING.x).setCardYSpacing(DEFAULT_SPACING.y).setShowSiblingsOfMain(true).setSingleParentEmptyCard(false);
        chart.setCardHtml().setCardImageField("avatar").setMiniTree(true).setCardDim({ w: 200, h: 72, height_auto: true }).setCardDisplay([
          ["first name", "last name"],
          ["birthday"],
        ]).setOnCardUpdate(function (this: HTMLElement, datum: { added?: boolean; data: { id?: string; data: { deceased?: boolean; gender?: string }; rels?: { spouses?: string[] } } }) {
          const card = this.querySelector(".card");
          if (!card) return;
          const id = datum.data.id ?? "";
          const spouses = datum.data.rels?.spouses ?? [];
          const marriedIn = Boolean(datum.added) || (Boolean(id) && !blood.has(id) && spouses.some((spouseId) => blood.has(spouseId)));
          card.classList.toggle("card-deceased", Boolean(datum.data.data.deceased));
          card.classList.toggle("card-spouse", marriedIn);
          const color = marriedIn ? (datum.data.data.gender === "F" ? "#d7b6bc" : "#b4d3b1") : "";
          const inner = card.querySelector(".card-inner");
          const icon = card.querySelector(".person-icon svg");
          if (inner instanceof HTMLElement) inner.style.backgroundColor = color;
          if (icon instanceof SVGElement) icon.style.backgroundColor = color;
        }).setOnCardClick((event: MouseEvent, datum: { data: { id: string } }) => {
          const target = event.target;
          if (target instanceof Element && target.closest(".mini-tree")) {
            const previous = chart.store.getMainId();
            const next = datum.data.id;
            if (previous && previous !== next) setTrail((stack) => [...stack, previous]);
            chart.updateMainId(next);
            chart.updateTree({ initial: false, tree_position: "main_to_middle", transition_time: 400 });
            return;
          }
          openCardRef.current(datum.data.id);
        });
        chart.setBeforeUpdate(() => {
          attachLoosePeople(chart, f3, looseAnchorRef.current, DEFAULT_SPACING);
          spreadCards(chart.store.getTree()?.data ?? [], DEFAULT_SPACING.x);
          blood = bloodlineIds(chart.store.getMainId(), chart.store.getData());
        });
        chart.setAfterUpdate(() => {
          drawLooseLinks(box.current, chart, spousesRef.current);
          paintSpouseLinks(box.current, spousesRef.current);
        });
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
    row.data["first name"] = displayGiven(draft.given_name, draft.hebrew_given);
    row.data["last name"] = displaySurname(draft.surname, draft.hebrew_surname);
    row.data.birthday = lifeLine(draft.birth_date, draft.death_date, draft.deceased);
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
          "first name": displayGiven(person.given_name, person.hebrew_given),
          "last name": displaySurname(person.surname, person.hebrew_surname),
          birthday: lifeLine(person.birth_date, person.death_date, person.deceased),
          deceased: person.deceased || Boolean(person.death_date.trim()),
        },
        rels: { parents: [], spouses: [], children: [] },
      });
    }
    return xref;
  }

  function returnToPrevious() {
    const chart = chartRef.current;
    if (!chart) return;
    const present = new Set(chart.store.getData().filter((row) => !row.to_add).map((row) => row.id));
    const next = trail.slice();
    while (next.length > 0 && !present.has(next[next.length - 1])) next.pop();
    const previous = next.pop() ?? "";
    setTrail(next);
    if (!previous) return;
    chart.updateMainId(previous);
    chart.updateTree({ initial: false, tree_position: "main_to_middle", transition_time: 400 });
  }

  function showAround(xref: string) {
    const chart = chartRef.current;
    if (!chart) return;
    dropMissingLinks(chart.store.getData());
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

  const loadTreePeople = useCallback(async (treeId: string) => {
    const text = await loadGedcomRef.current(treeId);
    const parsed = parseGedcom(new TextEncoder().encode(text));
    return parsed.people
      .map((person) => ({ id: person.xref, label: gedcomPersonLabel(person) }))
      .sort((left, right) => left.label.localeCompare(right.label, "he"));
  }, []);

  async function linkPerson(person: PersonCard, treeId: string, otherXref: string) {
    const chart = chartRef.current;
    const data = chart?.store.getData();
    const row = data?.find((item) => item.id === person.xref && !item.to_add);
    if (!chart || !data || !row) return;
    const text = await loadGedcomRef.current(treeId);
    const other = parseGedcom(new TextEncoder().encode(text));
    if (!other.people.some((item) => item.xref === otherXref)) throw new Error("האדם לא נמצא בעץ");
    const slice = familyAbove(other, otherXref);
    const bringsParents = slice.unions.some((union) => union.children.includes(otherXref) && (union.partnerA || union.partnerB));
    if (bringsParents && row.rels.parents.length > 0) throw new Error("לאדם הזה כבר יש הורים");
    const map = new Map<string, string>([[otherXref, person.xref]]);
    for (const ancestor of slice.people) map.set(ancestor.xref, `@I${crypto.randomUUID().replace(/-/g, "")}@`);
    const stored = Boolean(persistRef.current);
    const cards = slice.people.flatMap((ancestor) => {
      const xref = map.get(ancestor.xref);
      return xref ? [cardFromGedcom(ancestor, xref, stored)] : [];
    });
    for (const ancestor of slice.people) {
      const xref = map.get(ancestor.xref);
      if (xref) data.push(datumFromGedcom(ancestor, xref));
    }
    let spouses = spousesRef.current;
    for (const union of slice.unions) {
      const left = union.partnerA ? map.get(union.partnerA) ?? "" : "";
      const right = union.partnerB ? map.get(union.partnerB) ?? "" : "";
      const parentIds = [left, right].filter((id) => id.length > 0);
      for (const childId of union.children.flatMap((id) => {
        const next = map.get(id);
        return next ? [next] : [];
      })) {
        for (const parentId of parentIds) linkParent(data, childId, parentId);
      }
      if (left && right) {
        relatePair(data, [left, right]);
        spouses = tieSpouses(spouses, left, right, union.status, null);
      }
    }
    recordsRef.current = [
      ...recordsRef.current.map((item) => (item.xref === person.xref ? { ...item, linkTree: treeId, linkPerson: otherXref } : item)),
      ...cards,
    ];
    setRecords(recordsRef.current);
    setPeople((current) => [...current, ...cards.map((card) => ({ id: card.xref, label: labelOf(card) }))]);
    spousesRef.current = spouses;
    setSpouses(spouses);
    await commit();
    looseAnchorRef.current = person.xref;
    chart.updateTree({ initial: false, tree_position: "main_to_middle", transition_time: 400 });
  }

  async function unlinkPerson(person: PersonCard) {
    recordsRef.current = recordsRef.current.map((item) => (item.xref === person.xref ? { ...item, linkTree: "", linkPerson: "" } : item));
    setRecords(recordsRef.current);
    await commit();
  }

  async function removeAncestors(person: PersonCard) {
    const chart = chartRef.current;
    const data = chart?.store.getData() ?? [];
    const gone = ancestorTreeIds(person.xref, data);
    if (gone.size === 0) return;
    const next = data.filter((row) => !gone.has(row.id) && !row.to_add);
    for (const row of next) {
      row.rels.parents = row.rels.parents.filter((id) => !gone.has(id));
      row.rels.spouses = row.rels.spouses.filter((id) => !gone.has(id));
      row.rels.children = row.rels.children.filter((id) => !gone.has(id));
    }
    data.splice(0, data.length, ...next);
    dropMissingLinks(data);
    recordsRef.current = recordsRef.current.filter((row) => !gone.has(row.xref));
    setRecords(recordsRef.current);
    setPeople((current) => current.filter((row) => !gone.has(row.id)));
    const kept: Record<string, SpouseTie[]> = {};
    for (const [id, ties] of Object.entries(spousesRef.current)) {
      if (gone.has(id)) continue;
      const list = ties.filter((tie) => !gone.has(tie.xref));
      if (list.length > 0) kept[id] = list;
    }
    spousesRef.current = kept;
    setSpouses(kept);
    setTrail((stack) => stack.filter((id) => !gone.has(id)));
    await commit(next);
    await dropPersonPhotos([...gone]);
    if (!chart || next.length === 0) {
      chartRef.current = null;
      box.current?.replaceChildren();
      setEmpty(true);
      setOpenXref(null);
      return;
    }
    if (gone.has(chart.store.getMainId())) chart.updateMainId(person.xref);
    looseAnchorRef.current = person.xref;
    chart.updateTree({ initial: false, tree_position: "main_to_middle", transition_time: 400 });
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
    dropMissingLinks(data);
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
    await dropPersonPhotos([person.xref]);
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

  async function addPhoto(xref: string, file: File) {
    const owned = photosRef.current.filter((photo) => photo.person_xref === xref);
    if (owned.length >= 12) throw new Error("ניתן לשמור עד 12 תמונות");
    const shrunk = await shrinkImage(file, 960, 0.8);
    const data = await blobBase64(shrunk.blob);
    if (data.length > 700000) throw new Error("התמונה גדולה מדי");
    const thumbnail = !owned.some((photo) => photo.thumbnail);
    const saved = await addPhotoRef.current(xref, shrunk.contentType, data, thumbnail);
    photosRef.current = [...photosRef.current, saved];
    setPhotos(photosRef.current);
    const chart = chartRef.current;
    if (!chart) return;
    applyPortraits(chart.store.getData(), photosRef.current);
    chart.updateTree({ initial: false, tree_position: "inherit", transition_time: 0 });
  }

  async function chooseThumbnail(xref: string, photoId: string) {
    const current = photosRef.current.find((photo) => photo.id === photoId);
    if (!current || current.person_xref !== xref || current.thumbnail) return;
    await setThumbnailRef.current(xref, photoId);
    photosRef.current = photosRef.current.map((photo) => (photo.person_xref === xref ? { ...photo, thumbnail: photo.id === photoId } : photo));
    setPhotos(photosRef.current);
    const chart = chartRef.current;
    if (!chart) return;
    applyPortraits(chart.store.getData(), photosRef.current);
    chart.updateTree({ initial: false, tree_position: "inherit", transition_time: 0 });
  }

  async function removePhoto(photoId: string) {
    const current = photosRef.current.find((photo) => photo.id === photoId);
    await deletePhotoRef.current(photoId);
    let next = photosRef.current.filter((photo) => photo.id !== photoId);
    const replacement = current?.thumbnail ? next.find((photo) => photo.person_xref === current.person_xref) : undefined;
    if (current && replacement) {
      try {
        await setThumbnailRef.current(current.person_xref, replacement.id);
      } catch (reason) {
        setDrawError(reason instanceof Error && reason.message ? reason.message : "לא ניתן לשמור את התמונה");
      }
      next = next.map((photo) => (photo.person_xref === current.person_xref ? { ...photo, thumbnail: photo.id === replacement.id } : photo));
    }
    photosRef.current = next;
    setPhotos(next);
    const chart = chartRef.current;
    if (!chart) return;
    applyPortraits(chart.store.getData(), photosRef.current);
    chart.updateTree({ initial: false, tree_position: "inherit", transition_time: 0 });
  }

  async function dropPersonPhotos(xrefs: string[]) {
    const gone = new Set(xrefs.filter(Boolean));
    if (gone.size === 0) return;
    photosRef.current = photosRef.current.filter((photo) => !gone.has(photo.person_xref));
    setPhotos(photosRef.current);
    const chart = chartRef.current;
    if (chart) applyPortraits(chart.store.getData(), photosRef.current);
    try {
      await deletePhotosRef.current([...gone]);
    } catch (reason) {
      setDrawError(reason instanceof Error && reason.message ? reason.message : "לא ניתן למחוק את התמונה");
    }
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
      {trail.length > 0 ? (
        <button
          type="button"
          className="absolute z-30 flex items-center gap-1 rounded-full bg-white px-3 py-2 text-neutral-900 shadow"
          style={{ insetInlineStart: "0.75rem", top: "4.25rem" }}
          aria-label="חזרה לאדם הקודם"
          onClick={returnToPrevious}
        >
          <ChevronIcon className="size-5 rotate-90" />
          <span className="text-sm font-medium">חזרה</span>
        </button>
      ) : null}
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
      <style>{".f3 path.link, .f3 path.loose-link, .f3 .mini-tree line { stroke: #000; fill: none; } .f3 path.spouse-married { stroke: #1f7a4d; stroke-width: 2.5px; } .f3 path.spouse-divorced { stroke: #c0392b; stroke-width: 2.5px; } .f3 path.spouse-widowed { stroke: #6d28d9; stroke-width: 2.5px; } .f3 path.spouse-separated { stroke: #d97706; stroke-width: 2.5px; } .f3 path.spouse-partner { stroke: #2563eb; stroke-width: 2.5px; } .f3 div.card.card-deceased .card-inner { border: 3px solid #000; } .f3 div.card.card-spouse.card-male .card-inner, .f3 div.card.card-spouse.card-male .person-icon svg { background-color: #b4d3b1 !important; } .f3 div.card.card-spouse.card-female .card-inner, .f3 div.card.card-spouse.card-female .person-icon svg { background-color: #d7b6bc !important; } .f3 div.card-image-rect { width: 200px; min-width: 200px; max-width: 200px; overflow: hidden; } .f3 div.card-image-rect div.card-label { min-width: 0; flex: 1; height: auto; direction: rtl; text-align: center; align-items: center; } .f3 div.card-image-rect div.card-label > div { width: 100%; text-align: center; } .f3 div.card-image-rect div.card-label > div:nth-child(2) { direction: ltr; unicode-bidi: isolate; } .f3 div.card-image-rect img { width: 70px; height: 70px; padding: 0; margin-right: 10px; border-radius: 8px; object-fit: cover; flex: 0 0 auto; }"}</style>
      <div ref={box} dir="ltr" className="f3 relative min-h-0 flex-1 overflow-hidden" style={{ width: "100%", background: "var(--cream)", color: "#171717" }} />
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
          onRemoveAncestors={() => removeAncestors(openPerson)}
          otherTrees={otherTrees}
          onLoadTreePeople={loadTreePeople}
          onLinkPerson={(treeId, personId) => linkPerson(openPerson, treeId, personId)}
          onUnlinkPerson={() => unlinkPerson(openPerson)}
          onDelete={() => removePerson(openPerson)}
          photos={photos.flatMap((photo) => {
            if (photo.person_xref !== openPerson.xref) return [];
            const src = photoSrc(photo);
            return src ? [{ id: photo.id, src, thumbnail: photo.thumbnail }] : [];
          })}
          onAddPhoto={(file) => addPhoto(openPerson.xref, file)}
          onRemovePhoto={(id) => removePhoto(id)}
          onSetThumbnail={(id) => chooseThumbnail(openPerson.xref, id)}
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
    linkTree: "",
    linkPerson: "",
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

function spreadCards(nodes: TreeNode[], minStep: number) {
  const rows = new Map<number, TreeNode[]>();
  for (const node of nodes) {
    if (typeof node.x !== "number" || typeof node.y !== "number") continue;
    const key = Math.round(node.y / 8) * 8;
    const row = rows.get(key);
    if (row) row.push(node);
    else rows.set(key, [node]);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    for (let index = 1; index < row.length; index += 1) {
      const previous = row[index - 1].x ?? 0;
      const current = row[index].x ?? 0;
      if (current >= previous + minStep) continue;
      const shift = previous + minStep - current;
      for (let later = index; later < row.length; later += 1) {
        const node = row[later];
        if (!node) continue;
        node.x = (node.x ?? 0) + shift;
        if (typeof node._x === "number") node._x += shift;
      }
    }
  }
}

function attachLoosePeople(chart: ChartJump, layout: ChartLayout, anchorId: string | null, spacing: CardSpacing) {
  const tree = chart.store.getTree();
  if (!tree) return;
  const shown = new Set(tree.data.map((node) => node.data?.id).filter((id): id is string => Boolean(id)));
  const people = chart.store.getData().filter((row) => !row.to_add);
  const looseGroups = connectedGroups(people).filter((group) => group.every((person) => !shown.has(person.id)));
  if (looseGroups.length === 0) return;
  const shownNodes = new Map<string, TreeNode>();
  let edgeX = Number.NEGATIVE_INFINITY;
  let topY = Number.POSITIVE_INFINITY;
  for (const node of tree.data) {
    if (typeof node.x !== "number" || typeof node.y !== "number") continue;
    edgeX = Math.max(edgeX, node.x);
    topY = Math.min(topY, node.y);
    const id = node.data?.id;
    if (id) shownNodes.set(id, node);
  }
  const anchor = anchorId ? shownNodes.get(anchorId) : undefined;
  let cursorX = (Number.isFinite(edgeX) ? edgeX : anchor?.x ?? 0) + spacing.x;
  const top = Number.isFinite(topY) ? topY : anchor?.y ?? 0;
  for (const group of looseGroups) {
    const placed = placeGroup(group, layout, spacing);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (const point of placed.values()) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
    }
    const beside = group.some((person) => linkedShown(person, shownNodes));
    const dx = cursorX - minX;
    const dy = top - minY;
    for (const person of group) {
      const point = placed.get(person.id);
      if (!point) continue;
      const near = linkedShown(person, shownNodes);
      const x = near && typeof near.x === "number" ? near.x + spacing.x : point.x + dx;
      const y = near && typeof near.y === "number" ? near.y : point.y + dy;
      tree.data.push({ data: person, x, y, _x: x, _y: y, depth: 0, tid: `loose-${person.id}` });
      if (typeof x === "number") shownNodes.set(person.id, { data: person, x, y, _x: x, _y: y });
    }
    if (!beside && Number.isFinite(minX) && Number.isFinite(maxX)) cursorX += maxX - minX + spacing.x;
  }
}

function linkedShown(person: ChartDatum, shownNodes: Map<string, TreeNode>) {
  for (const id of [...person.rels.parents, ...person.rels.spouses, ...person.rels.children]) {
    const node = shownNodes.get(id);
    if (node) return node;
  }
  return undefined;
}

const LIFE_MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function lifeLine(birth: string, death: string, _deceased: boolean) {
  const born = dateParts(birth ?? "");
  const died = dateParts(death ?? "");
  if (!born) return "";
  if (!died) return String(born.year);
  const difference = died.year - born.year;
  const age = died.month === undefined || born.month === undefined
    ? (difference >= 0 ? difference : null)
    : fullYears(born, new Date(died.year, died.month, died.day ?? 1));
  const span = `${born.year} - ${died.year}`;
  return age === null ? span : `${span} (${age})`;
}

function dateParts(value: string) {
  const text = value.trim().replace(/^(?:ABT|EST|CAL|BEF|AFT|ABOUT|CIR|FROM|BET)\s+/i, "");
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) return { year: Number(iso[1]), month, day };
    return { year: Number(iso[1]) };
  }
  const full = text.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  const fullMonth = full ? LIFE_MONTHS[full[2].toUpperCase()] : undefined;
  if (full && fullMonth !== undefined) return { year: Number(full[3]), month: fullMonth, day: Number(full[1]) };
  const monthYear = text.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  const namedMonth = monthYear ? LIFE_MONTHS[monthYear[1].toUpperCase()] : undefined;
  if (monthYear && namedMonth !== undefined) return { year: Number(monthYear[2]), month: namedMonth };
  const year = text.match(/^(\d{4})\b/) ?? value.match(/(\d{4})/);
  return year ? { year: Number(year[1]) } : null;
}

function fullYears(birth: { year: number; month?: number; day?: number }, end: Date) {
  let age = end.getFullYear() - birth.year;
  if (birth.month !== undefined) {
    const birthDay = birth.day ?? 1;
    if (end.getMonth() < birth.month || (end.getMonth() === birth.month && end.getDate() < birthDay)) age -= 1;
  }
  return age >= 0 ? age : null;
}

function markThumbnails(list: FamilyPhoto[]) {
  const starred = new Set<string>();
  const covered = new Set<string>();
  for (const photo of list) {
    if (!photo.thumbnail || covered.has(photo.person_xref)) continue;
    covered.add(photo.person_xref);
    starred.add(photo.id);
  }
  for (const photo of list) {
    if (covered.has(photo.person_xref)) continue;
    covered.add(photo.person_xref);
    starred.add(photo.id);
  }
  return list.map((photo) => ({ ...photo, thumbnail: starred.has(photo.id) }));
}

function applyPortraits(rows: { id: string; data: object }[], list: FamilyPhoto[]) {
  const first = new Map<string, string>();
  const starred = new Map<string, string>();
  for (const photo of list) {
    const src = photoSrc(photo);
    if (!src) continue;
    if (!first.has(photo.person_xref)) first.set(photo.person_xref, src);
    if (photo.thumbnail) starred.set(photo.person_xref, src);
  }
  for (const row of rows) {
    const data = row.data as { avatar?: string };
    const src = starred.get(row.id) ?? first.get(row.id);
    if (src) data.avatar = src;
    else delete data.avatar;
  }
}

function photoSrc(photo: FamilyPhoto) {
  const data = photo.data.replace(/\s/g, "");
  if (photo.content_type !== "image/webp" && photo.content_type !== "image/jpeg" && photo.content_type !== "image/png") return "";
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) return "";
  return `data:${photo.content_type};base64,${data}`;
}

function blobBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const comma = text.indexOf(",");
      resolve(comma >= 0 ? text.slice(comma + 1).replace(/\s/g, "") : "");
    };
    reader.onerror = () => reject(new Error("לא ניתן לקרוא את התמונה"));
    reader.readAsDataURL(blob);
  });
}

function displayGiven(given: string, hebrew: string) {
  return hebrew.trim() || given;
}

function displaySurname(surname: string, hebrew: string) {
  return hebrew.trim() || surname;
}

function bloodlineIds(mainId: string, data: ChartDatum[]) {
  const byId = new Map(data.filter((row) => !row.to_add).map((row) => [row.id, row]));
  const blood = new Set<string>();
  const queue = [mainId];
  while (queue.length > 0) {
    const id = queue.pop();
    if (!id || blood.has(id) || !byId.has(id)) continue;
    blood.add(id);
    const row = byId.get(id);
    if (!row) continue;
    for (const parentId of row.rels.parents) queue.push(parentId);
    for (const childId of row.rels.children) queue.push(childId);
  }
  return blood;
}

function spouseStatus(spouses: Record<string, SpouseTie[]>, left: string, right: string): UnionStatus {
  return (spouses[left] ?? []).find((tie) => tie.xref === right)?.status
    ?? (spouses[right] ?? []).find((tie) => tie.xref === left)?.status
    ?? "married";
}

function paintSpouseLinks(root: HTMLElement | null, spouses: Record<string, SpouseTie[]>) {
  const statuses: UnionStatus[] = ["married", "divorced", "widowed", "separated", "partner"];
  root?.querySelectorAll("path.link").forEach((path) => {
    for (const status of statuses) path.classList.remove(`spouse-${status}`);
    const datum = (path as SVGPathElement & { __data__?: { spouse?: boolean; source?: { data?: { id?: string } }; target?: { data?: { id?: string } } } }).__data__;
    if (!datum?.spouse) return;
    const left = datum.source?.data?.id;
    const right = datum.target?.data?.id;
    if (!left || !right) return;
    path.classList.add(`spouse-${spouseStatus(spouses, left, right)}`);
  });
}

function drawLooseLinks(root: HTMLElement | null, chart: ChartJump, spouses: Record<string, SpouseTie[]>) {
  const links = root?.querySelector("svg .links_view");
  links?.querySelectorAll(".loose-link").forEach((node) => node.remove());
  const tree = chart.store.getTree();
  if (!links || !tree) return;
  const loose = new Map<string, { x: number; y: number; rels: ChartDatum["rels"] }>();
  for (const node of tree.data) {
    if (!node.tid?.startsWith("loose-") || !node.data || typeof node.x !== "number" || typeof node.y !== "number") continue;
    loose.set(node.data.id, { x: node.x, y: node.y, rels: node.data.rels });
  }
  const shown = new Map<string, { x: number; y: number }>();
  for (const node of tree.data) {
    if (node.tid?.startsWith("loose-") || !node.data || typeof node.x !== "number" || typeof node.y !== "number") continue;
    shown.set(node.data.id, { x: node.x, y: node.y });
  }
  for (const [id, node] of loose) {
    for (const otherId of [...node.rels.parents, ...node.rels.children, ...node.rels.spouses]) {
      if (otherId === id) continue;
      const other = loose.get(otherId) ?? shown.get(otherId);
      if (!other) continue;
      if (loose.has(otherId) && otherId < id && !node.rels.children.includes(otherId)) continue;
      const kind = node.rels.spouses.includes(otherId) ? spouseStatus(spouses, id, otherId) : undefined;
      links.append(looseLine(node.x, node.y, other.x, other.y, kind));
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

function placeGroup(group: ChartDatum[], layout: ChartLayout, spacing: CardSpacing) {
  const ids = new Set(group.map((row) => row.id));
  const source = group.map((row) => ({
    id: row.id,
    data: { ...row.data },
    rels: {
      parents: row.rels.parents.filter((id) => ids.has(id)),
      spouses: row.rels.spouses.filter((id) => ids.has(id)),
      children: row.rels.children.filter((id) => ids.has(id)),
    },
  }));
  const placed = new Map<string, { x: number; y: number }>();
  const remaining = new Set(ids);
  let cursor = 0;
  while (remaining.size > 0) {
    const rootId = source.find((row) => remaining.has(row.id))?.id;
    if (!rootId) break;
    const batch = layoutBloodline(source, rootId, layout, spacing).filter((point) => remaining.has(point.id));
    if (batch.length === 0) {
      placed.set(rootId, { x: cursor, y: 0 });
      remaining.delete(rootId);
      cursor += spacing.x;
      continue;
    }
    const minX = Math.min(...batch.map((point) => point.x));
    const maxX = Math.max(...batch.map((point) => point.x));
    const shift = cursor - minX;
    for (const point of batch) {
      placed.set(point.id, { x: point.x + shift, y: point.y });
      remaining.delete(point.id);
    }
    cursor += maxX - minX + spacing.x;
  }
  return placed;
}

function layoutBloodline(source: ChartDatum[], rootId: string, layout: ChartLayout, spacing: CardSpacing) {
  try {
    const copy = source.map((row) => ({
      id: row.id,
      data: { ...row.data },
      rels: {
        parents: [...row.rels.parents],
        spouses: [...row.rels.spouses],
        children: [...row.rels.children],
      },
    }));
    const laid = layout.calculateTree(copy, { main_id: rootId, single_parent_empty_card: false, node_separation: spacing.x, level_separation: spacing.y });
    const points: { id: string; x: number; y: number }[] = [];
    for (const node of laid.data) {
      const id = node.data?.id;
      if (!id || typeof node.x !== "number" || typeof node.y !== "number") continue;
      points.push({ id, x: node.x, y: node.y });
    }
    return points;
  } catch {
    return [];
  }
}

function looseLine(x1: number, y1: number, x2: number, y2: number, kind?: UnionStatus) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", kind ? `loose-link spouse-${kind}` : "loose-link");
  path.setAttribute("d", `M${x1} ${y1} L${x2} ${y2}`);
  return path;
}

function ancestorTreeIds(personId: string, data: ChartDatum[]) {
  const byId = new Map(data.filter((row) => !row.to_add).map((row) => [row.id, row]));
  const person = byId.get(personId);
  if (!person) return new Set<string>();
  const keep = new Set<string>();
  const family = [personId];
  while (family.length > 0) {
    const id = family.pop();
    if (!id || keep.has(id) || !byId.has(id)) continue;
    keep.add(id);
    const row = byId.get(id);
    if (!row) continue;
    for (const spouseId of row.rels.spouses) family.push(spouseId);
    for (const childId of row.rels.children) family.push(childId);
  }
  const ancestors = new Set<string>();
  const up = [...person.rels.parents];
  while (up.length > 0) {
    const id = up.pop();
    if (!id || keep.has(id) || ancestors.has(id) || !byId.has(id)) continue;
    ancestors.add(id);
    const row = byId.get(id);
    if (!row) continue;
    for (const parentId of row.rels.parents) up.push(parentId);
  }
  const remove = new Set(ancestors);
  for (const id of ancestors) {
    const row = byId.get(id);
    if (!row) continue;
    for (const spouseId of row.rels.spouses) {
      if (!keep.has(spouseId) && byId.has(spouseId)) remove.add(spouseId);
    }
  }
  const side = [...ancestors];
  while (side.length > 0) {
    const id = side.pop();
    const row = id ? byId.get(id) : undefined;
    if (!row) continue;
    for (const childId of row.rels.children) {
      if (keep.has(childId) || remove.has(childId) || !byId.has(childId)) continue;
      remove.add(childId);
      side.push(childId);
      const child = byId.get(childId);
      if (!child) continue;
      for (const spouseId of child.rels.spouses) {
        if (!keep.has(spouseId) && byId.has(spouseId)) remove.add(spouseId);
      }
    }
  }
  return remove;
}

function dropMissingLinks(data: ChartDatum[]) {
  const present = new Set(data.map((row) => row.id));
  for (const row of data) {
    row.rels.parents = row.rels.parents.filter((id) => present.has(id));
    row.rels.spouses = row.rels.spouses.filter((id) => present.has(id));
    row.rels.children = row.rels.children.filter((id) => present.has(id));
  }
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
    linkTree: person.linkTree ?? "",
    linkPerson: person.linkPerson ?? "",
  }));
}

function cardFromGedcom(person: GedcomPerson, xref: string, stored: boolean): PersonCard {
  return {
    xref,
    personId: stored ? xref : null,
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
    linkTree: "",
    linkPerson: "",
  };
}

function datumFromGedcom(person: GedcomPerson, xref: string): ChartDatum {
  return {
    id: xref,
    data: {
      gender: person.sex === "f" ? "F" : "M",
      "first name": displayGiven(person.given, person.hebrewGiven),
      "last name": displaySurname(person.surname, person.hebrewSurname),
      birthday: lifeLine(person.birthDate, person.deathDate, person.deceased),
      deceased: person.deceased || Boolean((person.deathDate ?? "").trim()),
    },
    rels: { parents: [], spouses: [], children: [] },
  };
}

function linkParent(data: ChartDatum[], childId: string, parentId: string) {
  const child = data.find((item) => item.id === childId);
  const parent = data.find((item) => item.id === parentId);
  if (!child || !parent) return;
  if (!child.rels.parents.includes(parentId) && child.rels.parents.length >= 2) return;
  relate(child.rels.parents, parentId);
  relate(parent.rels.children, childId);
}

function gedcomPersonLabel(person: GedcomPerson) {
  const hebrew = `${person.hebrewGiven} ${person.hebrewSurname}`.replace(/\s+/g, " ").trim();
  const english = `${person.given} ${person.surname}`.replace(/\s+/g, " ").trim();
  const name = hebrew && english ? `${hebrew} (${english})` : hebrew || english || "ללא שם";
  return person.birthDate ? `${name} · ${person.birthDate}` : name;
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
      birthDate: person.birth_date ?? "",
      birthPlace: person.birth_place ?? "",
      deathDate: person.death_date ?? "",
      deathPlace: person.death_place ?? "",
      deceased: person.deceased || Boolean((person.death_date ?? "").trim()),
      note: person.note ?? "",
      nickname: person.nickname ?? "",
      cause: person.cause_of_death ?? "",
      occupation: person.occupation ?? "",
      source: person.source ?? "",
      media: person.media ?? "",
      address: person.address ?? "",
      city: person.city ?? "",
      country: person.country ?? "",
      email: person.email ?? "",
      linkTree: person.linkTree ?? "",
      linkPerson: person.linkPerson ?? "",
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
        "first name": displayGiven(person.given, person.hebrewGiven),
        "last name": displaySurname(person.surname, person.hebrewSurname),
        birthday: lifeLine(person.birthDate, person.deathDate, person.deceased),
        deceased: person.deceased || Boolean((person.deathDate ?? "").trim()),
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
