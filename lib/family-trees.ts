/** Account family trees: list, GEDCOM import, and person links. */

import type { SupabaseClient } from "@supabase/supabase-js";

import { gedcomText, parseGedcom, type GedcomSex, type GedcomTree } from "@/lib/gedcom";
import { shrinkImage } from "@/lib/images";

export type FamilySex = GedcomSex;

export type FamilyTree = {
  id: string;
  account_id: string;
  name: string;
  sort_order: number;
};

export type FamilyPerson = {
  id: string;
  account_id: string;
  tree_id: string;
  given_name: string;
  surname: string;
  sex: FamilySex;
  birth_date: string;
  birth_place: string;
  death_date: string;
  death_place: string;
  note: string;
  deceased: boolean;
  image_path: string | null;
};

export const UNION_STATUSES = ["married", "divorced", "widowed", "separated", "partner"] as const;

export type UnionStatus = (typeof UNION_STATUSES)[number];

export type FamilyUnion = {
  id: string;
  account_id: string;
  tree_id: string;
  partner_a: string;
  partner_b: string | null;
  status: UnionStatus;
};

export type SpouseInput = {
  given_name: string;
  surname: string;
  status: UnionStatus;
  spouseId?: string | null;
};

export type FamilyChild = {
  union_id: string;
  person_id: string;
  account_id: string;
  sort_order: number;
};

export type FamilyGraph = {
  people: FamilyPerson[];
  unions: FamilyUnion[];
  children: FamilyChild[];
};

export type PersonDraft = {
  given_name: string;
  surname: string;
  sex: FamilySex;
  birth_date: string;
  birth_place: string;
  death_date: string;
  death_place: string;
  note: string;
  deceased: boolean;
};

const UNION_COLUMNS = "id, account_id, tree_id, partner_a, partner_b, status";
const UNION_COLUMNS_WITHOUT_STATUS = "id, account_id, tree_id, partner_a, partner_b";
const PERSON_COLUMNS = "id, account_id, tree_id, given_name, surname, sex, birth_date, birth_place, death_date, death_place, note, deceased, image_path";
const PERSON_COLUMNS_WITHOUT_DECEASED = "id, account_id, tree_id, given_name, surname, sex, birth_date, birth_place, death_date, death_place, note, image_path";
const PERSON_COLUMNS_WITHOUT_IMAGE = "id, account_id, tree_id, given_name, surname, sex, birth_date, birth_place, death_date, death_place, note";
const SAVE_FAILED = "לא ניתן לשמור את עץ המשפחה";
const LOAD_FAILED = "לא ניתן לטעון את עצי המשפחה";
const MISSING_TABLE = "טבלאות עצי המשפחה אינן קיימות עדיין. יש להריץ את קובץ הסכמה.";
const HAS_PARENTS = "כבר יש הורים לאדם הזה";

export function personName(person: Pick<FamilyPerson, "given_name" | "surname">) {
  const name = `${person.given_name} ${person.surname}`.replace(/\s+/g, " ").trim();
  return name || "ללא שם";
}

export function unionStatusLabel(status: UnionStatus) {
  if (status === "divorced") return "גירושים";
  if (status === "widowed") return "אלמנות";
  if (status === "separated") return "פירוד";
  if (status === "partner") return "ידועים בציבור";
  return "נישואים";
}

export function treeNameFromFile(fileName: string) {
  const base = fileName.replace(/\.ged$/i, "").replace(/[_]+/g, " ").trim();
  return clip(base || "עץ משפחה", 80);
}

export async function exportFamilyGedcom(supabase: SupabaseClient, tree: FamilyTree) {
  const graph = await loadFamilyGraph(supabase, tree.id);
  const base = tree.name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "עץ משפחה";
  return { name: `${base}.ged`, text: gedcomText(gedcomFromGraph(graph)) };
}

export async function loadFamilyTrees(supabase: SupabaseClient, accountId: string) {
  const { data, error } = await supabase.from("family_trees").select("id, account_id, name, sort_order").eq("account_id", accountId).order("sort_order");
  raise(error, LOAD_FAILED);
  return ((data ?? []) as FamilyTree[]).map(normalizeTree);
}

export async function loadFamilyGraph(supabase: SupabaseClient, treeId: string): Promise<FamilyGraph> {
  const people = await loadPeople(supabase, treeId);
  const unionRows = await loadUnions(supabase, treeId);
  const children: FamilyChild[] = [];
  const unionIds = unionRows.map((union) => union.id);
  for (let index = 0; index < unionIds.length; index += 100) {
    const { data, error } = await supabase.from("family_children").select("union_id, person_id, account_id, sort_order").in("union_id", unionIds.slice(index, index + 100));
    raise(error, LOAD_FAILED);
    children.push(...((data ?? []) as FamilyChild[]).map(normalizeChild));
  }
  return {
    people: people.map(normalizePerson),
    unions: unionRows,
    children,
  };
}

export async function createFamilyTree(supabase: SupabaseClient, accountId: string, name: string) {
  const trimmed = clip(name, 80);
  if (!trimmed) throw new Error("יש להזין שם");
  const sortOrder = await nextSortOrder(supabase, accountId);
  const { data, error } = await supabase
    .from("family_trees")
    .insert({ account_id: accountId, name: trimmed, sort_order: sortOrder })
    .select("id, account_id, name, sort_order")
    .single();
  raise(error, SAVE_FAILED);
  return normalizeTree(data as FamilyTree);
}

export async function renameFamilyTree(supabase: SupabaseClient, treeId: string, name: string) {
  const trimmed = clip(name, 80);
  if (!trimmed) throw new Error("יש להזין שם");
  const { error } = await supabase.from("family_trees").update({ name: trimmed }).eq("id", treeId);
  raise(error, SAVE_FAILED);
  return trimmed;
}

export async function deleteFamilyTree(supabase: SupabaseClient, treeId: string) {
  const { error } = await supabase.from("family_trees").delete().eq("id", treeId);
  raise(error, "לא ניתן למחוק את העץ");
}

export async function importGedcomFile(
  supabase: SupabaseClient,
  accountId: string,
  file: File,
  onProgress?: (ratio: number) => void,
) {
  if (file.size > 20 * 1024 * 1024) throw new Error("הקובץ גדול מדי");
  const parsed = parseGedcom(new Uint8Array(await file.arrayBuffer()));
  const tree = await createFamilyTree(supabase, accountId, treeNameFromFile(file.name));
  onProgress?.(0.08);
  try {
    const peopleByXref = new Map<string, string>();
    const people = parsed.people.map((person) => {
      const id = crypto.randomUUID();
      peopleByXref.set(person.xref, id);
      return {
        id,
        account_id: accountId,
        tree_id: tree.id,
        given_name: clip(person.given, 80),
        surname: clip(person.surname, 80),
        sex: person.sex,
        birth_date: clip(person.birthDate, 80),
        birth_place: clip(person.birthPlace, 120),
        death_date: clip(person.deathDate, 80),
        death_place: clip(person.deathPlace, 120),
        note: clip(person.note, 1000),
        deceased: person.deceased || Boolean(person.deathDate.trim()),
      };
    });
    await insertChunks(supabase, "family_people", people, (ratio) => onProgress?.(0.08 + ratio * 0.62));

    const unions = parsed.unions.flatMap((union) => {
      const partnerA = union.partnerA ? peopleByXref.get(union.partnerA) : undefined;
      const partnerB = union.partnerB ? peopleByXref.get(union.partnerB) ?? null : null;
      const partner_a = partnerA ?? partnerB ?? "";
      const partner_b = partnerA ? partnerB : null;
      if (!partner_a || (partner_b && partner_a === partner_b)) return [];
      return [{ id: crypto.randomUUID(), account_id: accountId, tree_id: tree.id, partner_a, partner_b, status: union.status, children: union.children }];
    });
    await insertChunks(
      supabase,
      "family_unions",
      unions.map((union) => ({
        id: union.id,
        account_id: union.account_id,
        tree_id: union.tree_id,
        partner_a: union.partner_a,
        partner_b: union.partner_b,
        status: union.status,
      })),
      (ratio) => onProgress?.(0.7 + ratio * 0.15),
    );

    const links = unions.flatMap((union) =>
      union.children.flatMap((xref, sortOrder) => {
        const personId = peopleByXref.get(xref);
        if (!personId || personId === union.partner_a || personId === union.partner_b) return [];
        return [{ union_id: union.id, person_id: personId, account_id: accountId, sort_order: sortOrder }];
      }),
    );
    await insertChunks(supabase, "family_children", links, (ratio) => onProgress?.(0.85 + ratio * 0.15));
    onProgress?.(1);
    return tree;
  } catch (error) {
    await supabase.from("family_trees").delete().eq("id", tree.id);
    throw error;
  }
}

export async function addFamilyPerson(supabase: SupabaseClient, accountId: string, treeId: string) {
  const { data, error } = await supabase
    .from("family_people")
    .insert(blankPerson(accountId, treeId))
    .select(PERSON_COLUMNS_WITHOUT_IMAGE)
    .single();
  raise(error, SAVE_FAILED);
  return normalizePerson(data as FamilyPerson);
}

export async function saveFamilyPerson(supabase: SupabaseClient, personId: string, draft: PersonDraft) {
  const sex: FamilySex = draft.sex === "m" || draft.sex === "f" ? draft.sex : "u";
  const row = {
    given_name: clip(draft.given_name, 80),
    surname: clip(draft.surname, 80),
    sex,
    birth_date: clip(draft.birth_date, 80),
    birth_place: clip(draft.birth_place, 120),
    death_date: clip(draft.death_date, 80),
    death_place: clip(draft.death_place, 120),
    note: clip(draft.note, 1000),
    deceased: draft.deceased || Boolean(draft.death_date.trim()),
  };
  let result = await supabase.from("family_people").update(row).eq("id", personId);
  if (missingColumn(result.error)) {
    const { deceased: _deceased, ...rest } = row;
    result = await supabase.from("family_people").update(rest).eq("id", personId);
  }
  raise(result.error, SAVE_FAILED);
  return row;
}

export async function deleteFamilyPerson(supabase: SupabaseClient, personId: string) {
  const { data } = await supabase.from("family_people").select("image_path").eq("id", personId).maybeSingle();
  const { error } = await supabase.from("family_people").delete().eq("id", personId);
  raise(error, "לא ניתן למחוק את האדם");
  const path = (data as { image_path?: string | null } | null)?.image_path;
  if (path) await supabase.storage.from("item-images").remove([path]);
}

export async function setFamilyPersonImage(supabase: SupabaseClient, person: FamilyPerson, file: File | null) {
  if (!file) {
    const { error } = await supabase.from("family_people").update({ image_path: null }).eq("id", person.id);
    raise(error, SAVE_FAILED);
    if (person.image_path) await supabase.storage.from("item-images").remove([person.image_path]);
    return null;
  }
  const prepared = await shrinkImage(file, 800, 0.82);
  const extension = prepared.contentType === "image/webp" ? "webp" : "jpg";
  const path = `${person.account_id}/family/${person.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("item-images").upload(path, prepared.blob, {
    contentType: prepared.contentType,
    upsert: false,
  });
  if (uploadError) throw new Error("לא ניתן לשמור את התמונה");
  const { error } = await supabase.from("family_people").update({ image_path: path }).eq("id", person.id);
  if (error) {
    await supabase.storage.from("item-images").remove([path]);
    raise(error, SAVE_FAILED);
  }
  if (person.image_path && person.image_path !== path) await supabase.storage.from("item-images").remove([person.image_path]);
  return path;
}

export async function addFamilySpouse(supabase: SupabaseClient, accountId: string, treeId: string, personId: string, input: SpouseInput) {
  const status = unionStatus(input.status);
  if (input.spouseId && input.spouseId === personId) throw new Error(SAVE_FAILED);
  const unions = await loadUnions(supabase, treeId);
  const mine = unions.filter((union) => union.partner_a === personId || union.partner_b === personId);
  let created = false;
  let spouse: FamilyPerson;
  if (input.spouseId) {
    const { data, error } = await supabase.from("family_people").select(PERSON_COLUMNS_WITHOUT_IMAGE).eq("id", input.spouseId).maybeSingle();
    raise(error, SAVE_FAILED);
    if (!data) throw new Error(SAVE_FAILED);
    spouse = normalizePerson(data as FamilyPerson);
  } else {
    spouse = await addFamilyPerson(supabase, accountId, treeId);
    created = true;
    const saved = await saveFamilyPerson(supabase, spouse.id, {
      given_name: input.given_name,
      surname: input.surname,
      sex: "u",
      birth_date: "",
      birth_place: "",
      death_date: "",
      death_place: "",
      note: "",
      deceased: status === "widowed",
    });
    spouse = { ...spouse, ...saved, image_path: spouse.image_path };
  }
  if (status === "widowed" && !spouse.deceased) {
    const saved = await saveFamilyPerson(supabase, spouse.id, { ...draftFromPerson(spouse), deceased: true });
    spouse = { ...spouse, ...saved, image_path: spouse.image_path };
  }
  const existing = mine.find((union) => union.partner_a === spouse.id || union.partner_b === spouse.id);
  if (existing) {
    if (existing.status !== status) await setFamilyUnionStatus(supabase, existing.id, status);
    return { person: spouse, union: { ...existing, status }, created };
  }
  const hasSpouse = mine.some((union) => union.partner_a && union.partner_b);
  const open = hasSpouse ? undefined : mine.find((union) => union.partner_a === personId && !union.partner_b);
  if (open) {
    const updated = await supabase.from("family_unions").update({ partner_b: spouse.id, status }).eq("id", open.id);
    const error = missingColumn(updated.error)
      ? (await supabase.from("family_unions").update({ partner_b: spouse.id }).eq("id", open.id)).error
      : updated.error;
    if (error) {
      if (created) await supabase.from("family_people").delete().eq("id", spouse.id);
      raise(error, SAVE_FAILED);
    }
    return { person: spouse, union: { ...open, partner_b: spouse.id, status }, created };
  }
  const linked = await insertUnion(supabase, accountId, treeId, personId, spouse.id, status);
  if (!linked) {
    if (created) await supabase.from("family_people").delete().eq("id", spouse.id);
    throw new Error(SAVE_FAILED);
  }
  return { person: spouse, union: linked, created };
}

export async function setFamilyUnionStatus(supabase: SupabaseClient, unionId: string, status: UnionStatus) {
  const next = unionStatus(status);
  const { error } = await supabase.from("family_unions").update({ status: next }).eq("id", unionId);
  raise(error, SAVE_FAILED);
  return next;
}

export async function addFamilyChild(supabase: SupabaseClient, accountId: string, treeId: string, personId: string) {
  const unions = (await loadUnions(supabase, treeId)).filter((union) => union.partner_a === personId || union.partner_b === personId);
  const preferred =
    unions.find((union) => union.status === "married" && union.partner_a && union.partner_b) ??
    unions.find((union) => union.partner_a && union.partner_b) ??
    unions[0] ??
    null;
  const union = preferred ?? (await insertUnion(supabase, accountId, treeId, personId, null));
  if (!union) throw new Error(SAVE_FAILED);
  const child = await addFamilyPerson(supabase, accountId, treeId);
  const { data: siblings, error: siblingError } = await supabase.from("family_children").select("sort_order").eq("union_id", union.id).order("sort_order", { ascending: false }).limit(1);
  if (siblingError) {
    await supabase.from("family_people").delete().eq("id", child.id);
    raise(siblingError, SAVE_FAILED);
  }
  const sortOrder = (((siblings ?? [])[0] as { sort_order?: number } | undefined)?.sort_order ?? -1) + 1;
  const link = { union_id: union.id, person_id: child.id, account_id: accountId, sort_order: sortOrder };
  const { error: linkError } = await supabase.from("family_children").insert(link);
  if (linkError) {
    await supabase.from("family_people").delete().eq("id", child.id);
    if (!preferred) await supabase.from("family_unions").delete().eq("id", union.id);
    raise(linkError, SAVE_FAILED);
  }
  return { person: child, union: preferred ? null : union, link };
}

export async function addFamilyParents(supabase: SupabaseClient, accountId: string, treeId: string, personId: string) {
  const { data: existing, error: existingError } = await supabase.from("family_children").select("union_id").eq("person_id", personId).limit(1);
  raise(existingError, SAVE_FAILED);
  if ((existing ?? []).length > 0) throw new Error(HAS_PARENTS);
  const parentA = await addFamilyPerson(supabase, accountId, treeId);
  const parentB = await addFamilyPerson(supabase, accountId, treeId);
  const union = await insertUnion(supabase, accountId, treeId, parentA.id, parentB.id);
  if (!union) {
    await supabase.from("family_people").delete().in("id", [parentA.id, parentB.id]);
    throw new Error(SAVE_FAILED);
  }
  const link = { union_id: union.id, person_id: personId, account_id: accountId, sort_order: 0 };
  const { error } = await supabase.from("family_children").insert(link);
  if (error) {
    await supabase.from("family_unions").delete().eq("id", union.id);
    await supabase.from("family_people").delete().in("id", [parentA.id, parentB.id]);
    raise(error, SAVE_FAILED);
  }
  return { parents: [parentA, parentB], union, link };
}

function blankPerson(accountId: string, treeId: string) {
  return {
    account_id: accountId,
    tree_id: treeId,
    given_name: "",
    surname: "",
    sex: "u",
    birth_date: "",
    birth_place: "",
    death_date: "",
    death_place: "",
    note: "",
    deceased: false,
  };
}

async function insertUnion(supabase: SupabaseClient, accountId: string, treeId: string, partnerA: string, partnerB: string | null, status: UnionStatus = "married") {
  const row = { account_id: accountId, tree_id: treeId, partner_a: partnerA, partner_b: partnerB, status };
  const inserted = await supabase.from("family_unions").insert(row).select(UNION_COLUMNS).single();
  const result = missingColumn(inserted.error)
    ? await supabase.from("family_unions").insert({ account_id: accountId, tree_id: treeId, partner_a: partnerA, partner_b: partnerB }).select(UNION_COLUMNS_WITHOUT_STATUS).single()
    : inserted;
  if (result.error || !result.data) return null;
  return normalizeUnion(result.data as FamilyUnion);
}

async function loadUnions(supabase: SupabaseClient, treeId: string) {
  const withStatus = await supabase.from("family_unions").select(UNION_COLUMNS).eq("tree_id", treeId);
  const result = missingColumn(withStatus.error)
    ? await supabase.from("family_unions").select(UNION_COLUMNS_WITHOUT_STATUS).eq("tree_id", treeId)
    : withStatus;
  raise(result.error, LOAD_FAILED);
  return ((result.data ?? []) as unknown as FamilyUnion[]).map(normalizeUnion);
}

function unionStatus(value: string | null | undefined): UnionStatus {
  return value && (UNION_STATUSES as readonly string[]).includes(value) ? (value as UnionStatus) : "married";
}

function draftFromPerson(person: FamilyPerson): PersonDraft {
  return {
    given_name: person.given_name,
    surname: person.surname,
    sex: person.sex,
    birth_date: person.birth_date,
    birth_place: person.birth_place,
    death_date: person.death_date,
    death_place: person.death_place,
    note: person.note,
    deceased: person.deceased,
  };
}

async function nextSortOrder(supabase: SupabaseClient, accountId: string) {
  const { data, error } = await supabase.from("family_trees").select("sort_order").eq("account_id", accountId).order("sort_order", { ascending: false }).limit(1);
  raise(error, SAVE_FAILED);
  return (((data ?? [])[0] as { sort_order?: number } | undefined)?.sort_order ?? -1) + 1;
}

async function insertChunks(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[], onProgress?: (ratio: number) => void) {
  if (rows.length === 0) {
    onProgress?.(1);
    return;
  }
  const size = 200;
  for (let index = 0; index < rows.length; index += size) {
    const { error } = await supabase.from(table).insert(rows.slice(index, index + size));
    raise(error, SAVE_FAILED);
    onProgress?.(Math.min(1, (index + size) / rows.length));
  }
}

function raise(error: { message: string; code?: string } | null, message: string) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || error.code === "PGRST204") throw new Error(MISSING_TABLE);
  throw new Error(message);
}

function missingColumn(error: { code?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function gedcomFromGraph(graph: FamilyGraph): GedcomTree {
  const xref = new Map<string, string>();
  graph.people.forEach((person, index) => xref.set(person.id, `@I${index + 1}@`));
  const childrenByUnion = new Map<string, FamilyChild[]>();
  for (const child of graph.children) {
    const list = childrenByUnion.get(child.union_id) ?? [];
    list.push(child);
    childrenByUnion.set(child.union_id, list);
  }
  return {
    people: graph.people.map((person) => ({
      xref: xref.get(person.id) ?? "",
      given: person.given_name,
      surname: person.surname,
      sex: person.sex,
      birthDate: person.birth_date,
      birthPlace: person.birth_place,
      deathDate: person.death_date,
      deathPlace: person.death_place,
      deceased: person.deceased || Boolean(person.death_date.trim()),
      note: person.note,
    })),
    unions: graph.unions.flatMap((union) => {
      const partnerA = xref.get(union.partner_a);
      if (!partnerA) return [];
      const children = (childrenByUnion.get(union.id) ?? [])
        .sort((left, right) => left.sort_order - right.sort_order)
        .flatMap((child) => {
          const id = xref.get(child.person_id);
          return id ? [id] : [];
        });
      return [{ partnerA, partnerB: union.partner_b ? xref.get(union.partner_b) ?? null : null, children, status: union.status }];
    }),
  };
}

function normalizeTree(row: FamilyTree): FamilyTree {
  return { id: row.id, account_id: row.account_id, name: row.name, sort_order: row.sort_order };
}

function normalizePerson(row: FamilyPerson): FamilyPerson {
  const sex: FamilySex = row.sex === "m" || row.sex === "f" ? row.sex : "u";
  return {
    id: row.id,
    account_id: row.account_id,
    tree_id: row.tree_id,
    given_name: row.given_name ?? "",
    surname: row.surname ?? "",
    sex,
    birth_date: row.birth_date ?? "",
    birth_place: row.birth_place ?? "",
    death_date: row.death_date ?? "",
    death_place: row.death_place ?? "",
    note: row.note ?? "",
    deceased: Boolean(row.deceased) || Boolean(row.death_date),
    image_path: row.image_path || null,
  };
}

async function loadPeople(supabase: SupabaseClient, treeId: string) {
  const selects = [PERSON_COLUMNS, PERSON_COLUMNS_WITHOUT_DECEASED, PERSON_COLUMNS_WITHOUT_IMAGE];
  let failure: { message: string; code?: string } | null = null;
  for (const columns of selects) {
    const result = await supabase.from("family_people").select(columns).eq("tree_id", treeId);
    if (!result.error) return (result.data ?? []) as unknown as FamilyPerson[];
    failure = result.error;
    if (!missingColumn(result.error)) break;
  }
  raise(failure, LOAD_FAILED);
  return [];
}

function normalizeUnion(row: FamilyUnion): FamilyUnion {
  return {
    id: row.id,
    account_id: row.account_id,
    tree_id: row.tree_id,
    partner_a: row.partner_a,
    partner_b: row.partner_b,
    status: unionStatus(row.status),
  };
}

function normalizeChild(row: FamilyChild): FamilyChild {
  return { union_id: row.union_id, person_id: row.person_id, account_id: row.account_id, sort_order: row.sort_order ?? 0 };
}
