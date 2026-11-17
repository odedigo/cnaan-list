/** GEDCOM reader for people, parent links, and a few Hebrew-friendly encodings. */

export type GedcomSex = "m" | "f" | "u";

export type GedcomPerson = {
  xref: string;
  given: string;
  surname: string;
  sex: GedcomSex;
  birthDate: string;
  birthPlace: string;
  deathDate: string;
  deathPlace: string;
  deceased: boolean;
  note: string;
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

export function parseGedcom(bytes: Uint8Array): GedcomTree {
  const text = decodeGedcom(bytes).replace(/^\uFEFF/, "");
  const lines = parseLines(text);
  if (!lines.some((line) => line.level === 0 && (line.tag === "HEAD" || line.tag === "INDI" || line.tag === "FAM"))) {
    throw new Error(NOT_GEDCOM);
  }

  const people = new Map<string, GedcomPerson>();
  const families: { partnerA: string; partnerB: string; children: string[]; status: GedcomUnionStatus }[] = [];

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
    index = end;
  }

  for (const family of families) {
    for (const xref of [family.partnerA, family.partnerB]) {
      if (xref && !people.has(xref)) people.set(xref, emptyPerson(xref));
    }
  }

  const claimed = new Set<string>();
  const unions: GedcomUnion[] = [];
  for (const family of families) {
    const partnerA = people.has(family.partnerA) ? family.partnerA : "";
    const partnerB = people.has(family.partnerB) ? family.partnerB : "";
    const first = partnerA || partnerB;
    if (!first) continue;
    const second = partnerA && partnerB && partnerA !== partnerB ? partnerB : null;
    const children: string[] = [];
    for (const child of family.children) {
      if (!people.has(child) || claimed.has(child) || child === first || child === second) continue;
      claimed.add(child);
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
      value: match[4] ?? "",
    });
  }
  return lines;
}

function readPerson(xref: string, body: GedcomLine[]): GedcomPerson {
  const person: GedcomPerson = {
    xref,
    given: "",
    surname: "",
    sex: "u",
    birthDate: "",
    birthPlace: "",
    deathDate: "",
    deathPlace: "",
    deceased: false,
    note: "",
  };
  let section: "" | "birth" | "death" | "note" = "";
  let named = false;
  for (const line of body) {
    if (line.level === 1) {
      section = "";
      if (line.tag === "NAME" && !named) {
        const name = splitName(line.value);
        person.given = name.given;
        person.surname = name.surname;
        named = true;
      } else if (line.tag === "SEX") {
        const sex = line.value.trim().toUpperCase();
        person.sex = sex.startsWith("M") ? "m" : sex.startsWith("F") ? "f" : "u";
      } else if (line.tag === "BIRT") section = "birth";
      else if (line.tag === "DEAT") {
        section = "death";
        person.deceased = true;
      } else if (line.tag === "ISDEAD" && /^(Y|YES|TRUE|1)$/i.test(line.value.trim())) person.deceased = true;
      else if (line.tag === "NOTE") {
        section = "note";
        person.note = line.value;
      }
      continue;
    }
    if (line.level === 2 && line.tag === "GIVN" && line.value) person.given = clean(line.value);
    else if (line.level === 2 && line.tag === "SURN" && line.value) person.surname = clean(line.value);
    else if (line.level === 2 && section === "birth" && line.tag === "DATE") person.birthDate = clean(line.value);
    else if (line.level === 2 && section === "birth" && line.tag === "PLAC") person.birthPlace = clean(line.value);
    else if (line.level === 2 && section === "death" && line.tag === "DATE") person.deathDate = clean(line.value);
    else if (line.level === 2 && section === "death" && line.tag === "PLAC") person.deathPlace = clean(line.value);
    else if (line.level >= 2 && section === "note" && line.tag === "CONC") person.note += line.value;
    else if (line.level >= 2 && section === "note" && line.tag === "CONT") person.note += `\n${line.value}`;
  }
  person.note = person.note.trim();
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
    sex: "u",
    birthDate: "",
    birthPlace: "",
    deathDate: "",
    deathPlace: "",
    deceased: false,
    note: "",
  };
}

function splitName(value: string) {
  const match = value.match(/^(.*?)\/([^/]*)\/(.*)$/);
  if (!match) return { given: clean(value), surname: "" };
  return { given: clean(`${match[1]} ${match[3]}`), surname: clean(match[2]) };
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const GEDCOM_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function gedcomText(tree: GedcomTree) {
  const byXref = new Map(tree.people.map((person) => [person.xref, person]));
  const lines = ["0 HEAD", "1 SOUR CnaanList", "1 GEDC", "2 VERS 5.5.1", "2 FORM LINEAGE-LINKED", "1 CHAR UTF-8"];
  for (const person of tree.people) {
    lines.push(`0 ${person.xref} INDI`);
    lines.push(`1 NAME ${gedcomValue(person.given)} /${gedcomValue(person.surname)}/`);
    if (person.sex === "m") lines.push("1 SEX M");
    else if (person.sex === "f") lines.push("1 SEX F");
    if (person.birthDate.trim() || person.birthPlace.trim()) {
      lines.push("1 BIRT");
      if (person.birthDate.trim()) lines.push(`2 DATE ${gedcomValue(gedcomDate(person.birthDate))}`);
      if (person.birthPlace.trim()) lines.push(`2 PLAC ${gedcomValue(person.birthPlace)}`);
    }
    if (person.deceased || person.deathDate.trim() || person.deathPlace.trim()) {
      lines.push("1 DEAT Y");
      if (person.deathDate.trim()) lines.push(`2 DATE ${gedcomValue(gedcomDate(person.deathDate))}`);
      if (person.deathPlace.trim()) lines.push(`2 PLAC ${gedcomValue(person.deathPlace)}`);
    }
    if (person.note.trim()) lines.push(...noteLines(person.note));
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

function noteLines(note: string) {
  const lines: string[] = [];
  note.split("\n").forEach((part, index) => {
    const pieces = part.match(/.{1,200}/g) ?? [""];
    pieces.forEach((piece, pieceIndex) => {
      if (index === 0 && pieceIndex === 0) lines.push(`1 NOTE ${gedcomValue(piece)}`);
      else if (pieceIndex === 0) lines.push(`2 CONT ${gedcomValue(piece)}`);
      else lines.push(`2 CONC ${piece.replace(/@/g, "@@")}`);
    });
  });
  return lines;
}
