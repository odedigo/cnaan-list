/** Account family trees. Each tree is one GEDCOM file stored on family_trees. */

import type { SupabaseClient } from "@supabase/supabase-js";

import { gedcomFileText, gedcomText, type GedcomSex } from "@/lib/gedcom";

export type FamilySex = GedcomSex;

export type FamilyTree = {
  id: string;
  account_id: string;
  name: string;
  sort_order: number;
};

export type FamilyPhoto = {
  id: string;
  person_xref: string;
  content_type: string;
  data: string;
  thumbnail: boolean;
};

export type FamilyPerson = {
  id: string;
  account_id: string;
  tree_id: string;
  given_name: string;
  surname: string;
  hebrew_given: string;
  hebrew_surname: string;
  sex: FamilySex;
  birth_date: string;
  birth_place: string;
  death_date: string;
  death_place: string;
  note: string;
  deceased: boolean;
  nickname: string;
  cause_of_death: string;
  occupation: string;
  source: string;
  media: string;
  address: string;
  city: string;
  country: string;
  email: string;
  image_path: string | null;
  link_id: string | null;
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
  hebrew_given: string;
  hebrew_surname: string;
  sex: FamilySex;
  birth_date: string;
  birth_place: string;
  death_date: string;
  death_place: string;
  note: string;
  deceased: boolean;
  nickname: string;
  cause_of_death: string;
  occupation: string;
  source: string;
  media: string;
  address: string;
  city: string;
  country: string;
  email: string;
};

export type FamilyLink = {
  personId: string;
  treeId: string;
  treeName: string;
  label: string;
};

export type FamilyPersonBrief = Pick<FamilyPerson, "id" | "given_name" | "surname" | "hebrew_given" | "hebrew_surname">;

const SAVE_FAILED = "לא ניתן לשמור את עץ המשפחה";
const PHOTO_SAVE_FAILED = "לא ניתן לשמור את התמונה";
const PHOTO_DELETE_FAILED = "לא ניתן למחוק את התמונה";
const LOAD_FAILED = "לא ניתן לטעון את עצי המשפחה";
const MISSING_TABLE = "טבלאות עצי המשפחה אינן קיימות עדיין. יש להריץ את קובץ הסכמה.";
const COPY_SUFFIX = "- עותק";
const EMPTY_GEDCOM = gedcomText({ people: [], unions: [] });

export function personName(person: Pick<FamilyPerson, "given_name" | "surname">) {
  const name = `${person.given_name} ${person.surname}`.replace(/\s+/g, " ").trim();
  return name || "ללא שם";
}

export function personLabel(person: Pick<FamilyPerson, "given_name" | "surname" | "hebrew_given" | "hebrew_surname">) {
  const english = `${person.given_name} ${person.surname}`.replace(/\s+/g, " ").trim();
  const hebrew = `${person.hebrew_given ?? ""} ${person.hebrew_surname ?? ""}`.replace(/\s+/g, " ").trim();
  if (hebrew && english) return `${hebrew} (${english})`;
  return hebrew || english || "ללא שם";
}

export function unionStatusLabel(status: UnionStatus) {
  if (status === "divorced") return "גירושים";
  if (status === "widowed") return "אלמנות";
  if (status === "separated") return "פרודים";
  if (status === "partner") return "ידועים בציבור";
  return "נישואים";
}

export function treeNameFromFile(fileName: string) {
  const base = fileName.replace(/\.ged$/i, "").replace(/[_]+/g, " ").trim();
  return clip(base || "עץ משפחה", 80);
}

export async function loadFamilyTrees(supabase: SupabaseClient, accountId: string) {
  const { data, error } = await supabase.from("family_trees").select("id, account_id, name, sort_order").eq("account_id", accountId).order("sort_order");
  raise(error, LOAD_FAILED);
  return ((data ?? []) as FamilyTree[]).map(normalizeTree);
}

export async function loadFamilyGedcom(supabase: SupabaseClient, treeId: string) {
  const { data, error } = await supabase.from("family_trees").select("gedcom").eq("id", treeId).maybeSingle();
  raise(error, LOAD_FAILED);
  return typeof data?.gedcom === "string" ? data.gedcom : "";
}

export async function createFamilyTree(supabase: SupabaseClient, accountId: string, name: string) {
  const trimmed = clip(name, 80);
  if (!trimmed) throw new Error("יש להזין שם");
  const sortOrder = await nextSortOrder(supabase, accountId);
  const { data, error } = await supabase
    .from("family_trees")
    .insert({ account_id: accountId, name: trimmed, sort_order: sortOrder, gedcom: EMPTY_GEDCOM })
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

export async function saveFamilyGedcom(supabase: SupabaseClient, treeId: string, gedcom: string) {
  const { error } = await supabase.from("family_trees").update({ gedcom }).eq("id", treeId);
  raise(error, SAVE_FAILED);
}

export async function deleteFamilyTree(supabase: SupabaseClient, treeId: string) {
  const { error } = await supabase.from("family_trees").delete().eq("id", treeId);
  raise(error, "לא ניתן למחוק את העץ");
}

export async function duplicateFamilyTree(supabase: SupabaseClient, source: FamilyTree) {
  const gedcom = await loadFamilyGedcom(supabase, source.id);
  let photos: FamilyPhoto[] = [];
  try {
    photos = await loadFamilyPhotos(supabase, source.id);
  } catch (reason) {
    if (!(reason instanceof Error) || reason.message !== MISSING_TABLE) throw reason;
  }
  const sortOrder = await nextSortOrder(supabase, source.account_id);
  const { data, error } = await supabase
    .from("family_trees")
    .insert({ account_id: source.account_id, name: duplicateTreeName(source.name), sort_order: sortOrder, gedcom })
    .select("id, account_id, name, sort_order")
    .single();
  raise(error, SAVE_FAILED);
  const created = normalizeTree(data as FamilyTree);
  if (photos.length === 0) return created;
  const { error: imageError } = await supabase.from("family_person_images").insert(photos.map((photo) => ({
    tree_id: created.id,
    person_xref: photo.person_xref,
    content_type: photo.content_type,
    data: photo.data,
    thumbnail: photo.thumbnail,
  })));
  if (imageError) {
    await supabase.from("family_trees").delete().eq("id", created.id);
    raise(imageError, SAVE_FAILED);
  }
  return created;
}

export async function loadFamilyPhotos(supabase: SupabaseClient, treeId: string) {
  const { data, error } = await supabase
    .from("family_person_images")
    .select("id, person_xref, content_type, data, thumbnail")
    .eq("tree_id", treeId)
    .order("created_at");
  raise(error, LOAD_FAILED);
  return ((data ?? []) as FamilyPhoto[]).map(normalizePhoto);
}

export async function addFamilyPhoto(supabase: SupabaseClient, treeId: string, xref: string, contentType: string, data: string, thumbnail: boolean) {
  const { data: row, error } = await supabase
    .from("family_person_images")
    .insert({ tree_id: treeId, person_xref: xref, content_type: contentType, data, thumbnail })
    .select("id, person_xref, content_type, data, thumbnail")
    .single();
  raise(error, PHOTO_SAVE_FAILED);
  return normalizePhoto(row as FamilyPhoto);
}

export async function setFamilyPhotoThumbnail(supabase: SupabaseClient, treeId: string, xref: string, photoId: string) {
  const { error: clearError } = await supabase
    .from("family_person_images")
    .update({ thumbnail: false })
    .eq("tree_id", treeId)
    .eq("person_xref", xref)
    .neq("id", photoId);
  raise(clearError, PHOTO_SAVE_FAILED);
  const { error } = await supabase.from("family_person_images").update({ thumbnail: true }).eq("id", photoId);
  raise(error, PHOTO_SAVE_FAILED);
}

export async function deleteFamilyPhoto(supabase: SupabaseClient, photoId: string) {
  const { error } = await supabase.from("family_person_images").delete().eq("id", photoId);
  raise(error, PHOTO_DELETE_FAILED);
}

export async function deleteFamilyPhotos(supabase: SupabaseClient, treeId: string, xrefs: string[]) {
  const ids = [...new Set(xrefs.map((xref) => xref.trim()).filter(Boolean))];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { error } = await supabase.from("family_person_images").delete().eq("tree_id", treeId).in("person_xref", chunk);
    raise(error, PHOTO_DELETE_FAILED);
  }
}

export async function exportFamilyGedcom(supabase: SupabaseClient, tree: FamilyTree) {
  const text = await loadFamilyGedcom(supabase, tree.id);
  const base = tree.name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "עץ משפחה";
  return { name: `${base}.ged`, text };
}

export async function importGedcomFile(supabase: SupabaseClient, accountId: string, file: File) {
  const text = gedcomFileText(new Uint8Array(await file.arrayBuffer()));
  const sortOrder = await nextSortOrder(supabase, accountId);
  const { data, error } = await supabase
    .from("family_trees")
    .insert({ account_id: accountId, name: treeNameFromFile(file.name), sort_order: sortOrder, gedcom: text })
    .select("id, account_id, name, sort_order")
    .single();
  raise(error, SAVE_FAILED);
  return normalizeTree(data as FamilyTree);
}

async function nextSortOrder(supabase: SupabaseClient, accountId: string) {
  const { data, error } = await supabase.from("family_trees").select("sort_order").eq("account_id", accountId).order("sort_order", { ascending: false }).limit(1);
  raise(error, SAVE_FAILED);
  const last = data?.[0]?.sort_order;
  return typeof last === "number" ? last + 1 : 0;
}

function duplicateTreeName(name: string) {
  const room = 80 - COPY_SUFFIX.length;
  return `${name.trim().slice(0, Math.max(0, room))}${COPY_SUFFIX}`;
}

function normalizeTree(row: FamilyTree): FamilyTree {
  return { id: row.id, account_id: row.account_id, name: row.name, sort_order: row.sort_order };
}

function normalizePhoto(row: FamilyPhoto): FamilyPhoto {
  return {
    id: row.id,
    person_xref: row.person_xref,
    content_type: row.content_type,
    data: typeof row.data === "string" ? row.data.replace(/\s/g, "") : "",
    thumbnail: row.thumbnail === true,
  };
}

function raise(error: { message: string; code?: string } | null, message: string) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || error.code === "PGRST204") throw new Error(MISSING_TABLE);
  throw new Error(message);
}

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}
