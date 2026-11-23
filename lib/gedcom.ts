/** GEDCOM reader for people, parent links, and a few Hebrew-friendly encodings. */

export type GedcomSex = "m" | "f" | "u";

export type GedcomPerson = {
  xref: string;
  given: string;
  surname: string;
  hebrewGiven: string;
  hebrewSurname: string;
  sex: GedcomSex;
  birthDate: string;
  birthPlace: string;
  deathDate: string;
  deathPlace: string;
  deceased: boolean;
  note: string;
  nickname: string;
  cause: string;
  occupation: string;
  source: string;
  media: string;
  address: string;
  city: string;
  country: string;
  email: string;
  linkTree: string;
  linkPerson: string;
};

export type GedcomUnionStatus = "married" | "divorced" | "widowed" | "separated" | "partner";

export type GedcomUnion = {
  partnerA: string | null;
  partnerB: string | null;
  children: string[];
  status: GedcomUnionStatus;
};

export type GedcomTree = {
  people: GedcomPerson[];
  unions: GedcomUnion[];
};

type GedcomLine = {
  level: number;
  xref: string;
  tag: string;
  value: string;
};

const UNSUPPORTED_CHARSET = "הקידוד של הקובץ אינו נתמך";
const NOT_GEDCOM = "הקובץ אינו קובץ GEDCOM";

export function gedcomFileText(bytes: Uint8Array) {
  parseGedcom(bytes);
  return decodeGedcom(bytes).replace(/^\uFEFF/, "");
}

export function parseGedcom(bytes: Uint8Array): GedcomTree {
  const text = decodeGedcom(bytes).replace(/^\uFEFF/, "");
  const lines = parseLines(text);
  if (!lines.some((line) => line.level === 0 && (line.tag === "HEAD" || line.tag === "INDI" || line.tag === "FAM"))) {
    throw new Error(NOT_GEDCOM);
  }

  const people = new Map<string, GedcomPerson>();
  const families: { partnerA: string; partnerB: string; children: string[]; status: GedcomUnionStatus }[] = [];
  const sourceRecords = new Map<string, string>();
  const mediaRecords = new Map<string, string>();

  let index = 0;
  while (index < lines.length) {
    const start = lines[index];
    if (start.level !== 0) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < lines.length && lines[end].level > 0) end += 1;
    const body = lines.slice(index + 1, end);
    if (start.tag === "INDI" && start.xref && !people.has(start.xref)) people.set(start.xref, readPerson(start.xref, body));
    if (start.tag === "FAM") families.push(readFamily(body));
    if (start.tag === "SOUR" && start.xref) sourceRecords.set(start.xref, readSourceRecord(body));
    if (start.tag === "OBJE" && start.xref) mediaRecords.set(start.xref, readMediaRecord(body));
    index = end;
  }

  for (const person of people.values()) {
    person.source = resolvePointers(person.source, sourceRecords);
    person.media = resolvePointers(person.media, mediaRecords);
  }

  for (const family of families) {
    for (const xref of [family.partnerA, family.partnerB]) {
      if (xref && !people.has(xref)) people.set(xref, emptyPerson(xref));
    }
  }

  const parentSlots = new Map<string, number>();
  const unions: GedcomUnion[] = [];
  for (const family of families) {
    const partnerA = people.has(family.partnerA) ? family.partnerA : "";
    const partnerB = people.has(family.partnerB) ? family.partnerB : "";
    const first = partnerA || partnerB;
    if (!first) continue;
    const second = partnerA && partnerB && partnerA !== partnerB ? partnerB : null;
    const incoming = second ? 2 : 1;
    const children: string[] = [];
    for (const child of family.children) {
      if (!people.has(child) || child === first || child === second) continue;
      const used = parentSlots.get(child) ?? 0;
      if (used >= 2 || used + incoming > 2) continue;
      parentSlots.set(child, used + incoming);
      children.push(child);
    }
    let status = family.status;
    if (status === "married" && second) {
      const left = people.get(first);
      const right = people.get(second);
      if (left?.deceased || right?.deceased) status = "widowed";
    }
    unions.push({ partnerA: first, partnerB: second, children, status });
  }

  return { people: [...people.values()], unions };
}

export function familyAbove(tree: GedcomTree, xref: string): GedcomTree {
  const ids = new Set(tree.people.map((person) => person.xref));
  if (!ids.has(xref)) return { people: [], unions: [] };
  const rels = relationIndex(tree);
  const excluded = new Set<string>();
  const parents = new Set(rels.get(xref)?.parents ?? []);
  const down = [xref];
  while (down.length > 0) {
    const id = down.pop();
    if (!id || excluded.has(id) || !ids.has(id)) continue;
    excluded.add(id);
    const row = rels.get(id);
    if (!row) continue;
    for (const spouseId of row.spouses) {
      if (parents.has(spouseId) || !ids.has(spouseId)) continue;
      excluded.add(spouseId);
    }
    for (const childId of row.children) down.push(childId);
  }
  const copy = new Set<string>();
  const queue = [...parents];
  while (queue.length > 0) {
    const id = queue.pop();
    if (!id || excluded.has(id) || copy.has(id) || !ids.has(id)) continue;
    copy.add(id);
    const row = rels.get(id);
    if (!row) continue;
    queue.push(...row.parents, ...row.spouses, ...row.children);
  }
  const people = tree.people.filter((person) => copy.has(person.xref)).map((person) => ({ ...person, linkTree: "", linkPerson: "" }));
  const unions: GedcomUnion[] = [];
  for (const union of tree.unions) {
    const partnerA = union.partnerA && copy.has(union.partnerA) ? union.partnerA : null;
    const partnerB = union.partnerB && copy.has(union.partnerB) ? union.partnerB : null;
    if (!partnerA && !partnerB) continue;
    const children = union.children.filter((id) => copy.has(id) || id === xref);
    if (children.length === 0 && !(partnerA && partnerB)) continue;
    unions.push({ partnerA, partnerB, children, status: union.status });
  }
  return { people, unions };
}

function relationIndex(tree: GedcomTree) {
  const rels = new Map<string, { parents: string[]; spouses: string[]; children: string[] }>();
  const row = (id: string) => {
    const current = rels.get(id);
    if (current) return current;
    const created = { parents: [] as string[], spouses: [] as string[], children: [] as string[] };
    rels.set(id, created);
    return created;
  };
  const add = (list: string[], id: string) => {
    if (id && !list.includes(id)) list.push(id);
  };
  for (const union of tree.unions) {
    const partners = [union.partnerA, union.partnerB].filter((id): id is string => Boolean(id));
    if (partners.length === 2) {
      const [left, right] = partners;
      if (left && right) {
        add(row(left).spouses, right);
        add(row(right).spouses, left);
      }
    }
    for (const child of union.children) {
      for (const parent of partners) {
        add(row(child).parents, parent);
        add(row(parent).children, child);
      }
    }
  }
  return rels;
}

function decodeGedcom(bytes: Uint8Array) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  if (bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[2] === 0) return new TextDecoder("utf-16be").decode(bytes);

  const sample = new TextDecoder("latin1").decode(bytes.subarray(0, 8000));
  if (!/(?:^|\n)\s*0\s+HEAD\b/i.test(sample) && !/(?:^|\n)\s*0\s+@[^@]+@\s+INDI\b/i.test(sample)) throw new Error(NOT_GEDCOM);
  const headEnd = sample.search(/(?:^|\n)\s*0\s+(?:@[^@]+@\s+)?(?:INDI|FAM|SUBM|TRLR)\b/i);
  const head = headEnd > 0 ? sample.slice(0, headEnd) : sample;
  const charset = head.match(/(?:^|\n)\s*1\s+CHAR\s+([^\r\n]+)/i)?.[1] ?? "";
  const version = head.match(/(?:^|\n)\s*2\s+VERS\s+([^\r\n]+)/i)?.[1] ?? "";
  const kind = charsetKind(charset, version);
  if (kind === "unsupported") throw new Error(UNSUPPORTED_CHARSET);
  if (kind === "windows-1255") return new TextDecoder("windows-1255").decode(bytes);
  if (kind === "utf-16le") return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

function charsetKind(label: string, version: string) {
  const value = label.trim().toUpperCase().replace(/_/g, "-");
  if (!value || value === "UTF-8" || value === "UTF8") return "utf-8";
  if (value === "UTF-16" || value === "UTF16" || value === "UNICODE") return "utf-16le";
  if (value === "WINDOWS-1255" || value === "CP1255" || value === "MS-HEBR" || value === "IBM1255") return "windows-1255";
  if ((value === "ANSI" || value === "IBMPC" || value === "IBM-PC") && version.toUpperCase().includes("1255")) return "windows-1255";
  return "unsupported";
}

function parseLines(text: string) {
  const lines: GedcomLine[] = [];
  for (const raw of text.split(/\r\n|\n|\r/)) {
    const match = raw.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/);
    if (!match) continue;
    lines.push({
      level: Number(match[1]),
      xref: match[2] ?? "",
      tag: match[3].toUpperCase(),
      value: (match[4] ?? "").replace(/@@/g, "@"),
    });
  }
  return lines;
}

function readPerson(xref: string, body: GedcomLine[]): GedcomPerson {
  const person: GedcomPerson = {
    xref,
    given: "",
    surname: "",
    hebrewGiven: "",
    hebrewSurname: "",
    sex: "u",
    birthDate: "",
    birthPlace: "",
    deathDate: "",
    deathPlace: "",
    deceased: false,
    note: "",
    nickname: "",
    cause: "",
    occupation: "",
    source: "",
    media: "",
    address: "",
    city: "",
    country: "",
    email: "",
    linkTree: "",
    linkPerson: "",
  };
  const nicks: string[] = [];
  const jobs: string[] = [];
  const sources: string[] = [];
  const media: string[] = [];
  let cause = "";
  let source: TextParts | null = null;
  let object: TextParts | null = null;
  let place: PlaceBits | null = null;
  const places: PlaceBits[] = [];
  let conc: ConcTarget = "";
  let section: "" | "birth" | "death" | "note" | "resi" = "";
  let name: { role: "primary" | "extra"; parts: NameParts } | null = null;
  let tran: { parts: NameParts; lang: string; hebrew: boolean } | null = null;
  let hebrew: NameParts | null = null;
  const keepTran = () => {
    if (!tran) return;
    if (tran.hebrew || (!(tran.lang ?? "").trim() && !hebrew)) hebrew = tran.parts;
    tran = null;
  };
  const commitSource = () => {
    const text = formatParts(source);
    if (text) sources.push(text);
    source = null;
  };
  const commitObject = () => {
    const text = formatMedia(object);
    if (text) {
      if (object?.primary) media.unshift(text);
      else media.push(text);
    }
    object = null;
  };
  const commitPlace = () => {
    if (place && (place.address || place.city || place.country || place.email)) places.push(place);
    place = null;
  };
  for (const line of body) {
    if (line.tag === "CONC" || line.tag === "CONT") {
      const extra = line.tag === "CONT" ? `\n${line.value}` : line.value;
      if (conc === "note") person.note += extra;
      else if (conc === "nick" && nicks.length > 0) nicks[nicks.length - 1] += extra;
      else if (conc === "cause") cause += extra;
      else if (conc === "job" && jobs.length > 0) jobs[jobs.length - 1] += extra;
      else if (conc === "source" && source) source.head += extra;
      else if (conc === "page" && source) source.page += extra;
      else if (conc === "text" && source) source.text += extra;
      else if (conc === "title" && source) source.title += extra;
      else if (conc === "title" && object) object.title += extra;
      else if (conc === "file" && object) object.file += extra;
      else if (conc === "addr" && place) place.address += extra;
      continue;
    }
    if (line.level === 1) {
      keepTran();
      commitSource();
      commitObject();
      commitPlace();
      section = "";
      name = null;
      conc = "";
      if (line.tag === "NAME") {
        const parts = splitName(line.value);
        if (!person.given && !person.surname) {
          person.given = parts.given;
          person.surname = parts.surname;
          name = { role: "primary", parts: { given: person.given, surname: person.surname } };
        } else name = { role: "extra", parts };
      } else if (line.tag === "SEX") {
        const sex = line.value.trim().toUpperCase();
        person.sex = sex.startsWith("M") ? "m" : sex.startsWith("F") ? "f" : "u";
      } else if (line.tag === "BIRT") section = "birth";
      else if (line.tag === "DEAT") {
        section = "death";
        person.deceased = true;
      } else if (line.tag === "ISDEAD" && /^(Y|YES|TRUE|1)$/i.test(line.value.trim())) person.deceased = true;
      else if (line.tag === "_LINK") {
        const [treeId, personId] = line.value.trim().split(/\s+/);
        if (treeId && personId) {
          person.linkTree = treeId;
          person.linkPerson = personId;
        }
      } else if (line.tag === "NOTE") {
        section = "note";
        person.note = line.value;
        conc = "note";
      } else if (line.tag === "NICK") {
        nicks.push(line.value);
        conc = "nick";
      } else if (line.tag === "OCCU") {
        jobs.push(line.value);
        conc = "job";
      } else if (line.tag === "SOUR") {
        source = emptyParts(line.value);
        conc = "source";
      } else if (line.tag === "OBJE") {
        object = emptyParts(pointerOf(line.value));
        conc = "";
      } else if (line.tag === "ADDR") {
        place = emptyPlace(line.value, 2);
        conc = "addr";
      } else if (line.tag === "EMAIL") {
        place = emptyPlace("", 2);
        place.email = line.value;
      } else if (line.tag === "RESI") section = "resi";
      continue;
    }
    if (line.level === 2 && name && line.tag === "GIVN" && line.value) {
      name.parts.given = clean(line.value);
      if (name.role === "primary") person.given = name.parts.given;
    } else if (line.level === 2 && name && line.tag === "SURN" && line.value) {
      name.parts.surname = clean(line.value);
      if (name.role === "primary") person.surname = name.parts.surname;
    } else if (line.level === 2 && name?.role === "extra" && line.tag === "TYPE" && hebrewNameType(line.value)) hebrew = name.parts;
    else if (line.level === 2 && name?.role === "primary" && (line.tag === "_HEB" || line.tag === "_HEBN" || line.tag === "_HEBREW") && line.value) hebrew = splitName(line.value);
    else if (line.level === 2 && name?.role === "primary" && line.tag === "TRAN") {
      keepTran();
      tran = { parts: splitName(line.value), lang: "", hebrew: false };
    } else if (line.level === 3 && tran && line.tag === "LANG") {
      tran.lang = line.value;
      tran.hebrew = hebrewLanguage(line.value);
    } else if (line.level === 3 && tran && line.tag === "GIVN" && line.value) tran.parts.given = clean(line.value);
    else if (line.level === 3 && tran && line.tag === "SURN" && line.value) tran.parts.surname = clean(line.value);
    else if (line.level === 2 && section === "birth" && line.tag === "DATE") person.birthDate = clean(line.value);
    else if (line.level === 2 && section === "birth" && line.tag === "PLAC") person.birthPlace = clean(line.value);
    else if (line.level === 2 && name && line.tag === "NICK") {
      nicks.push(line.value);
      conc = "nick";
    } else if (line.level === 2 && section === "death" && line.tag === "DATE") person.deathDate = clean(line.value);
    else if (line.level === 2 && section === "death" && line.tag === "PLAC") person.deathPlace = clean(line.value);
    else if (line.level === 2 && (section === "resi" || section === "birth" || section === "death") && line.tag === "ADDR") {
      commitPlace();
      place = emptyPlace(line.value, section === "resi" ? 1 : section === "birth" ? 3 : 4);
      conc = "addr";
    } else if (place && (line.tag === "CITY" || line.tag === "CTRY" || line.tag === "EMAIL")) {
      if (line.tag === "CITY") place.city = line.value;
      else if (line.tag === "CTRY") place.country = line.value;
      else place.email = line.value;
      conc = "";
    }
    else if (line.level === 2 && section === "death" && line.tag === "CAUS") {
      cause = line.value;
      conc = "cause";
    } else if (line.level === 2 && line.tag === "SOUR") {
      commitSource();
      source = emptyParts(line.value);
      conc = "source";
    } else if (source && line.tag === "PAGE") {
      source.page = line.value;
      conc = "page";
    } else if (source && line.tag === "TEXT") {
      source.text = joinText(source.text, line.value);
      conc = "text";
    } else if (source && line.tag === "TITL") {
      source.title = line.value;
      conc = "title";
    } else if (object && line.tag === "FILE") {
      object.file = line.value;
      conc = "file";
    } else if (object && line.tag === "TITL") {
      object.title = line.value;
      conc = "title";
    } else if (object && line.tag === "FORM") {
      object.form = line.value;
      conc = "";
    } else if (object && line.tag === "_PRIM" && /^(Y|YES|TRUE|1)$/i.test(line.value.trim())) {
      object.primary = true;
    } else if (line.level === 2 && jobs.length > 0 && line.tag === "PLAC" && section !== "birth" && section !== "death" && section !== "resi") {
      jobs[jobs.length - 1] += (jobs[jobs.length - 1] ?? "").trim() ? `, ${line.value}` : line.value;
    } else conc = "";
  }
  keepTran();
  commitSource();
  commitObject();
  commitPlace();
  const chosen = places.sort((a, b) => a.rank - b.rank)[0];
  person.email = clean(places.map((item) => item.email).find((item) => (item ?? "").trim()) ?? "");
  const address = tidy(chosen?.address ?? "");
  person.address = address === person.email ? "" : address;
  person.city = clean(chosen?.city ?? "");
  person.country = clean(chosen?.country ?? "");
  person.hebrewGiven = hebrew?.given ?? "";
  person.hebrewSurname = hebrew?.surname ?? "";
  person.note = tidy(plainNote(person.note));
  person.nickname = joinUnique(nicks);
  person.cause = clean(cause);
  person.occupation = joinLines(jobs);
  person.source = sources.join("\n\n");
  person.media = media.join("\n");
  return person;
}

function readFamily(body: GedcomLine[]) {
  let partnerA = "";
  let partnerB = "";
  const children: string[] = [];
  let divorced = false;
  let separated = false;
  let widowed = false;
  let partner = false;
  for (const line of body) {
    const value = line.value.trim().toUpperCase();
    if (line.level === 1) {
      const xref = line.value.match(/@[^@]+@/)?.[0] ?? "";
      if (line.tag === "HUSB" && xref && !partnerA) partnerA = xref;
      else if (line.tag === "WIFE" && xref && !partnerB) partnerB = xref;
      else if (line.tag === "CHIL" && xref) children.push(xref);
      else if (line.tag === "DIV" || line.tag === "DIVF") divorced = true;
      else if (line.tag === "SEPR" || line.tag === "_SEPR") separated = true;
      else if (line.tag === "MARR" && value === "N") partner = true;
    }
    if (line.tag === "TYPE" || line.tag === "STAT" || line.tag === "_STAT") {
      if (value.includes("DIV")) divorced = true;
      else if (value.includes("WID")) widowed = true;
      else if (value.includes("SEP")) separated = true;
      else if (value.includes("PARTNER") || value === "UNMARRIED") partner = true;
    }
  }
  const status: GedcomUnionStatus = divorced ? "divorced" : separated ? "separated" : widowed ? "widowed" : partner ? "partner" : "married";
  return { partnerA, partnerB, children, status };
}

function emptyPerson(xref: string): GedcomPerson {
  return {
    xref,
    given: "",
    surname: "",
    hebrewGiven: "",
    hebrewSurname: "",
    sex: "u",
    birthDate: "",
    birthPlace: "",
    deathDate: "",
    deathPlace: "",
    deceased: false,
    note: "",
    nickname: "",
    cause: "",
    occupation: "",
    source: "",
    media: "",
    address: "",
    city: "",
    country: "",
    email: "",
    linkTree: "",
    linkPerson: "",
  };
}

type TextParts = { head: string; page: string; text: string; title: string; file: string; form: string; primary: boolean };
type PlaceBits = { address: string; city: string; country: string; email: string; rank: number };
type ConcTarget = "" | "note" | "nick" | "cause" | "job" | "source" | "page" | "text" | "title" | "file" | "addr";

function emptyParts(head = ""): TextParts {
  return { head, page: "", text: "", title: "", file: "", form: "", primary: false };
}

function emptyPlace(address: string, rank: number): PlaceBits {
  return { address, city: "", country: "", email: "", rank };
}

function pointerOf(value: string) {
  return value.match(/@[^@]+@/)?.[0] ?? "";
}

function formatMedia(parts: TextParts | null) {
  if (!parts) return "";
  const file = tidy(parts.file);
  const title = clean(parts.title);
  const form = clean(parts.form).replace(/^\./, "");
  const target = file || tidy(parts.head);
  if (!target && !title) return "";
  if (form) return [title, target, form].filter(Boolean).join(" | ");
  return title && target ? `${title} | ${target}` : target || title;
}

function formatParts(parts: TextParts | null) {
  if (!parts) return "";
  const file = tidy(parts.file);
  const title = clean(parts.title);
  if (file || (title && !tidy(parts.head) && !clean(parts.page) && !tidy(parts.text))) {
    return title && file ? `${title} | ${file}` : file || title;
  }
  const summary = [title, tidy(parts.head), clean(parts.page)].filter(Boolean).join(" · ");
  const text = tidy(parts.text);
  return [summary, text].filter(Boolean).join("\n");
}

function readSourceRecord(body: GedcomLine[]) {
  const parts = emptyParts();
  let conc: ConcTarget = "";
  for (const line of body) {
    if (line.tag === "CONC" || line.tag === "CONT") {
      const extra = line.tag === "CONT" ? `\n${line.value}` : line.value;
      if (conc === "title") parts.title += extra;
      else if (conc === "source") parts.head += extra;
      else if (conc === "text") parts.text += extra;
      continue;
    }
    conc = "";
    if (line.tag === "TITL") {
      parts.title = line.value;
      conc = "title";
    } else if (line.tag === "AUTH" || line.tag === "PUBL" || line.tag === "ABBR") {
      parts.head = joinText(parts.head, line.value);
      conc = "source";
    } else if (line.tag === "TEXT" || line.tag === "NOTE") {
      parts.text = joinText(parts.text, line.value);
      conc = "text";
    }
  }
  return formatParts(parts);
}

function readMediaRecord(body: GedcomLine[]) {
  const parts = emptyParts();
  let conc: ConcTarget = "";
  for (const line of body) {
    if (line.tag === "CONC" || line.tag === "CONT") {
      const extra = line.tag === "CONT" ? `\n${line.value}` : line.value;
      if (conc === "file") parts.file += extra;
      else if (conc === "title") parts.title += extra;
      continue;
    }
    conc = "";
    if (line.tag === "FILE") {
      parts.file = line.value;
      conc = "file";
    } else if (line.tag === "FORM") {
      parts.form = line.value;
    } else if (line.tag === "TITL") {
      parts.title = line.value;
      conc = "title";
    }
  }
  return formatMedia(parts);
}

function resolvePointers(value: string, records: Map<string, string>) {
  if (!value.trim() || records.size === 0) return value;
  return value.replace(/@[^@\s]+@/g, (pointer) => records.get(pointer) || pointer);
}

function joinText(current: string, value: string) {
  if (!current.trim()) return value;
  if (!value.trim()) return current;
  return `${current}\n${value}`;
}

function joinUnique(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const text = clean(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    next.push(text);
  }
  return next.join(", ");
}

function joinLines(values: string[]) {
  return values.map((value) => clean(value)).filter(Boolean).join("\n");
}

function tidy(value: string) {
  return value.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Turns an HTML note into plain text. A note without tags is left as it is. */
export function plainNote(value: string) {
  let text = value.replace(/\r\n?/g, "\n");
  for (let pass = 0; pass < 2 && !hasHtml(text); pass += 1) {
    const decoded = decodeEntities(text);
    if (decoded === text) break;
    text = decoded;
  }
  if (!hasHtml(text)) return value;
  const stripped = text
    .replace(/<\s*br\b[^>]*>/gi, "\n")
    .replace(/<\s*\/\s*(?:p|div|h[1-6]|tr|li|blockquote|section|table|ul|ol|pre)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return tidy(decodeEntities(stripped));
}

function hasHtml(value: string) {
  return /<\/?[a-z][^>]*>/i.test(value);
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) => fromCode(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => fromCode(Number.parseInt(digits, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function fromCode(code: number) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

type NameParts = { given: string; surname: string };

function splitName(value: string): NameParts {
  const match = value.match(/^(.*?)\/([^/]*)\/(.*)$/);
  if (!match) return { given: clean(value), surname: "" };
  return { given: clean(`${match[1]} ${match[3]}`), surname: clean(match[2]) };
}

function hebrewLanguage(value: string) {
  const label = value.trim().toLowerCase();
  return label === "he" || label === "heb" || label === "iw" || label === "hebrew" || label === "עברית";
}

function hebrewNameType(value: string) {
  const label = value.trim().toLowerCase();
  return label === "he" || label === "iw" || label.includes("hebrew") || label.includes("עברית");
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const GEDCOM_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function gedcomText(tree: GedcomTree) {
  const byXref = new Map(tree.people.map((person) => [person.xref, person]));
  const lines = ["0 HEAD", "1 SOUR CnaanList", "1 GEDC", "2 VERS 5.5.1", "2 FORM LINEAGE-LINKED", "1 CHAR UTF-8"];
  for (const raw of tree.people) {
    const person = {
      ...raw,
      given: raw.given ?? "",
      surname: raw.surname ?? "",
      hebrewGiven: raw.hebrewGiven ?? "",
      hebrewSurname: raw.hebrewSurname ?? "",
      birthDate: raw.birthDate ?? "",
      birthPlace: raw.birthPlace ?? "",
      deathDate: raw.deathDate ?? "",
      deathPlace: raw.deathPlace ?? "",
      note: raw.note ?? "",
      nickname: raw.nickname ?? "",
      cause: raw.cause ?? "",
      occupation: raw.occupation ?? "",
      source: raw.source ?? "",
      media: raw.media ?? "",
      address: raw.address ?? "",
      city: raw.city ?? "",
      country: raw.country ?? "",
      email: raw.email ?? "",
      linkTree: raw.linkTree ?? "",
      linkPerson: raw.linkPerson ?? "",
    };
    lines.push(`0 ${person.xref} INDI`);
    lines.push(`1 NAME ${gedcomValue(person.given)} /${gedcomValue(person.surname)}/`);
    if (person.hebrewGiven.trim() || person.hebrewSurname.trim()) {
      lines.push(`2 TRAN ${gedcomValue(person.hebrewGiven)} /${gedcomValue(person.hebrewSurname)}/`);
      lines.push("3 LANG he");
      if (person.hebrewGiven.trim()) lines.push(`3 GIVN ${gedcomValue(person.hebrewGiven)}`);
      if (person.hebrewSurname.trim()) lines.push(`3 SURN ${gedcomValue(person.hebrewSurname)}`);
    }
    if (person.nickname.trim()) lines.push(...textLines(2, "NICK", person.nickname));
    if (person.sex === "m") lines.push("1 SEX M");
    else if (person.sex === "f") lines.push("1 SEX F");
    if (person.birthDate.trim() || person.birthPlace.trim()) {
      lines.push("1 BIRT");
      if (person.birthDate.trim()) lines.push(`2 DATE ${gedcomValue(gedcomDate(person.birthDate))}`);
      if (person.birthPlace.trim()) lines.push(`2 PLAC ${gedcomValue(person.birthPlace)}`);
    }
    if (person.deceased || person.deathDate.trim() || person.deathPlace.trim() || person.cause.trim()) {
      lines.push("1 DEAT Y");
      if (person.deathDate.trim()) lines.push(`2 DATE ${gedcomValue(gedcomDate(person.deathDate))}`);
      if (person.deathPlace.trim()) lines.push(`2 PLAC ${gedcomValue(person.deathPlace)}`);
      if (person.cause.trim()) lines.push(...textLines(2, "CAUS", person.cause));
    }
    for (const job of person.occupation.split("\n")) {
      if (job.trim()) lines.push(...textLines(1, "OCCU", job));
    }
    for (const chunk of person.source.split(/\n{2,}/)) lines.push(...exportTagged(1, "SOUR", chunk));
    for (const item of person.media.split("\n")) lines.push(...mediaLines(item));
    if (person.address.trim() || person.city.trim() || person.country.trim() || person.email.trim()) {
      lines.push(...textLines(1, "ADDR", person.address));
      if (person.city.trim()) lines.push(`2 CITY ${gedcomValue(person.city)}`);
      if (person.country.trim()) lines.push(`2 CTRY ${gedcomValue(person.country)}`);
      if (person.email.trim()) lines.push(`2 EMAIL ${gedcomValue(person.email)}`);
    }
    if (person.note.trim()) lines.push(...textLines(1, "NOTE", person.note));
    if (person.linkTree.trim() && person.linkPerson.trim()) lines.push(`1 _LINK ${gedcomValue(person.linkTree)} ${gedcomValue(person.linkPerson)}`);
  }
  tree.unions.forEach((union, index) => {
    const left = union.partnerA ? byXref.get(union.partnerA) : undefined;
    const right = union.partnerB ? byXref.get(union.partnerB) : undefined;
    let husband = union.partnerA;
    let wife = union.partnerB;
    if (left && right && left.sex !== "m" && right.sex === "m") {
      husband = union.partnerB;
      wife = union.partnerA;
    } else if (left?.sex === "f" && !right) {
      husband = null;
      wife = union.partnerA;
    }
    lines.push(`0 @F${index + 1}@ FAM`);
    if (husband) lines.push(`1 HUSB ${husband}`);
    if (wife) lines.push(`1 WIFE ${wife}`);
    if (union.status === "partner") lines.push("1 MARR N");
    else if (union.status !== "separated") lines.push("1 MARR");
    if (union.status === "divorced") lines.push("1 DIV Y");
    if (union.status === "separated") lines.push("1 _SEPR Y");
    if (union.status === "widowed") {
      lines.push("1 EVEN");
      lines.push("2 TYPE WIDOWED");
    }
    for (const child of union.children) lines.push(`1 CHIL ${child}`);
  });
  lines.push("0 TRLR");
  return `${lines.join("\r\n")}\r\n`;
}

function gedcomDate(value: string) {
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const month = iso ? GEDCOM_MONTHS[Number(iso[2]) - 1] : "";
  if (!iso || !month) return value.trim();
  return `${Number(iso[3])} ${month} ${iso[1]}`;
}

function gedcomValue(value: string) {
  return value.replace(/@/g, "@@").replace(/[\r\n]+/g, " ").trim();
}

function textLines(level: number, tag: string, value: string) {
  const lines: string[] = [];
  const next = level + 1;
  value.split("\n").forEach((part, index) => {
    const pieces = part.match(/.{1,200}/g) ?? [""];
    pieces.forEach((piece, pieceIndex) => {
      if (index === 0 && pieceIndex === 0) lines.push(`${level} ${tag} ${gedcomValue(piece)}`);
      else if (pieceIndex === 0) lines.push(`${next} CONT ${gedcomValue(piece)}`);
      else lines.push(`${next} CONC ${piece.replace(/@/g, "@@")}`);
    });
  });
  return lines;
}

function exportTagged(level: number, tag: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (/^@[^@]+@$/.test(trimmed)) return [`${level} ${tag} ${trimmed}`];
  return textLines(level, tag, trimmed);
}

export function gedcomImageUrl(media: string) {
  for (const item of media.split("\n")) {
    const file = mediaParts(item).file;
    if (/^https?:\/\//i.test(file)) return file;
  }
  return "";
}

function mediaParts(value: string) {
  const bits = value.split(" | ").map((part) => part.trim()).filter(Boolean);
  const formLike = (part: string) => /^(jpe?g|png|gif|webp|bmp|tiff?|pdf)$/i.test(part);
  if (bits.length >= 2 && formLike(bits[bits.length - 1])) {
    const form = bits.pop() ?? "";
    const file = bits.pop() ?? "";
    return { title: bits.join(" | "), file, form };
  }
  const splitAt = value.lastIndexOf(" | ");
  if (splitAt < 0) return { title: "", file: value.trim(), form: "" };
  return { title: value.slice(0, splitAt).trim(), file: value.slice(splitAt + 3).trim(), form: "" };
}

function mediaLines(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (/^@[^@]+@$/.test(trimmed)) return [`1 OBJE ${trimmed}`];
  const { title, file, form } = mediaParts(trimmed);
  const lines = ["1 OBJE"];
  if (file) lines.push(...textLines(2, "FILE", file));
  if (form) lines.push(`3 FORM ${gedcomValue(form)}`);
  if (title) lines.push(...textLines(2, "TITL", title));
  return lines;
}
