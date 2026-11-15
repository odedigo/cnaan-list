export function isInstalledApp() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

type ContactPicker = {
  select: (properties: string[], options?: { multiple?: boolean }) => Promise<unknown>;
  getProperties?: () => Promise<unknown>;
};

const wantedContactProperties = ["name", "icon"];
let contactProperties = wantedContactProperties;

/** Contact picking exists only in the installed Android app. */
export function androidContactPicker() {
  if (typeof navigator === "undefined" || !isInstalledApp()) return null;
  if (!/Android/i.test(navigator.userAgent)) return null;
  const contacts = (navigator as Navigator & { contacts?: ContactPicker }).contacts;
  if (!contacts || typeof contacts.select !== "function") return null;
  return contacts;
}

/** Learn which contact fields this phone can share before the button is pressed. */
export function prepareAndroidContacts() {
  const picker = androidContactPicker();
  if (!picker?.getProperties) return;
  void Promise.resolve()
    .then(() => picker.getProperties?.())
    .then((available) => {
      const supported = contactPropertyList(available);
      if (supported.length > 0) contactProperties = supported;
    })
    .catch(() => undefined);
}

export async function pickAndroidContact() {
  const picker = androidContactPicker();
  if (!picker) return null;
  const contacts = await picker.select(contactProperties, { multiple: false });
  const contact = selectedContact(contacts);
  if (!contact) return null;
  const record = contact as Record<string, unknown>;
  let name = "";
  try {
    name = contactName(record);
  } catch {
    name = "";
  }
  // Copy the photo during this task. Android drops the picker bytes afterwards.
  const image = await contactPhoto(record.icon ?? record.icons ?? record.photo ?? record.avatar);
  if (!name) {
    try {
      name = contactName(record);
    } catch {
      name = "";
    }
  }
  return { name, image };
}

function selectedContact(contacts: unknown) {
  if (contacts && typeof contacts === "object" && !Array.isArray(contacts) && ("name" in contacts || "icon" in contacts)) return contacts;
  const [contact] = contactItems(contacts);
  return contact && typeof contact === "object" ? contact : null;
}

function contactPropertyList(available: unknown) {
  const values = contactItems(available).filter((value): value is string => typeof value === "string");
  return wantedContactProperties.filter((property) => values.includes(property));
}

function contactName(record: Record<string, unknown>) {
  return firstText(record.name) || firstText(record.names) || firstText(record.displayName);
}

function firstText(value: unknown) {
  for (const entry of contactItems(value)) {
    const text = textOf(entry).trim();
    if (text) return text.slice(0, 80);
  }
  return "";
}

function textOf(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return "";
  const record = entry as Record<string, unknown>;
  for (const key of ["displayName", "name", "formatted", "givenName", "familyName"]) {
    if (typeof record[key] === "string") return record[key];
  }
  return "";
}

async function contactPhoto(value: unknown) {
  for (const entry of contactItems(value)) {
    try {
      const file = await contactImageFile(entry);
      if (file) return file;
    } catch {
      // Try the next photo the contact offered.
    }
  }
  return null;
}

async function contactImageFile(entry: unknown) {
  const blob = await imageBlob(entry);
  if (!blob) return null;
  const bytes = await blob.arrayBuffer();
  if (bytes.byteLength === 0) return null;
  const type = imageType(blob.type, bytes);
  if (!type) return null;
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/gif" ? "gif" : "jpg";
  return new File([bytes], `contact.${extension}`, { type });
}

async function imageBlob(entry: unknown): Promise<Blob | null> {
  if (isBinary(entry)) return entry;
  if (typeof entry !== "string") return null;
  const text = entry.trim();
  if (text.startsWith("data:image/")) {
    const response = await fetch(text);
    return response.blob();
  }
  if (text.length < 128 || !/^[A-Za-z0-9+/=\s]+$/.test(text)) return null;
  const binary = atob(text.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes]);
}

function imageType(claimed: string, bytes: ArrayBuffer) {
  const sniffed = sniffImage(bytes);
  if (sniffed) return sniffed;
  const type = claimed.toLowerCase();
  if (!type.startsWith("image/") || type === "image/svg+xml") return null;
  return type === "image/jpg" ? "image/jpeg" : type;
}

function sniffImage(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) return "image/jpeg";
  if (view.length >= 8 && view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47) return "image/png";
  if (view.length >= 6 && view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46) return "image/gif";
  if (
    view.length >= 12 &&
    view[0] === 0x52 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x46 &&
    view[8] === 0x57 &&
    view[9] === 0x45 &&
    view[10] === 0x42 &&
    view[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function contactItems(value: unknown): unknown[] {
  if (typeof value === "string" || isBinary(value)) return [value];
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    if (Symbol.iterator in value) {
      try {
        return Array.from(value as Iterable<unknown>);
      } catch {
        return [value];
      }
    }
    const length = (value as { length?: unknown }).length;
    if (typeof length === "number" && length >= 0 && length <= 20) {
      return Array.from({ length }, (_, index) => (value as Record<number, unknown>)[index]).filter((entry) => entry != null);
    }
  }
  return value == null ? [] : [value];
}

function isBinary(value: unknown): value is Blob {
  if (!value || typeof value !== "object") return false;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  const blob = value as Blob;
  return typeof blob.arrayBuffer === "function" && typeof blob.size === "number";
}

function isIos() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function closeInstalledApp() {
  // Browsers only honor close() for a window a script opened, or a session
  // whose history has a single entry. This runs inside the menu click.
  window.close();
  const extra = window.history.length - 1;
  if (extra <= 0) {
    window.history.back();
    return;
  }
  if (!isIos()) {
    // Android and desktop installs still block close() while older history
    // entries exist. Opening this window onto itself clears that block.
    const opened = window.open("", "_self");
    opened?.close();
    return;
  }
  // iOS ignores close() once the installed app has history. Return to the
  // launch entry, then step back once more so the system can leave the app.
  window.addEventListener(
    "popstate",
    () => {
      window.history.back();
    },
    { once: true },
  );
  window.history.go(-extra);
}
