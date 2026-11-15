export function isInstalledApp() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

type ContactPicker = {
  select: (properties: string[], options?: { multiple?: boolean }) => Promise<unknown>;
  getProperties?: () => Promise<unknown>;
};

export type PickedAndroidContact = { name: string; image: File | null };

const wantedContactProperties = ["name", "icon"];
let contactProperties = wantedContactProperties;
let heldContact: PickedAndroidContact | null = null;

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

export function heldAndroidContact() {
  return heldContact;
}

export function clearHeldAndroidContact() {
  heldContact = null;
}

export async function pickAndroidContact(onName?: (name: string) => void) {
  const picker = androidContactPicker();
  if (!picker) return null;
  const contacts = await picker.select(contactProperties, { multiple: false });
  const [contact] = contactList(contacts);
  if (!contact || typeof contact !== "object") return null;
  const record = contact as Record<string, unknown>;
  const name = contactName(record);
  heldContact = { name, image: null };
  if (name) onName?.(name);
  const image = await contactPhoto(record.icon ?? record.icons ?? record.photo ?? record.avatar);
  const picked = { name: name || contactName(record), image };
  heldContact = picked;
  return picked;
}

function contactPropertyList(available: unknown) {
  const values = contactList(available).filter((value): value is string => typeof value === "string");
  return wantedContactProperties.filter((property) => values.includes(property));
}

function contactList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (Symbol.iterator in value) {
    try {
      return Array.from(value as Iterable<unknown>);
    } catch {
      return [value];
    }
  }
  return [value];
}

function contactName(record: Record<string, unknown>) {
  return firstText(record.name) || firstText(record.names) || firstText(record.displayName);
}

function firstText(value: unknown) {
  for (const entry of textList(value)) {
    const text = entry.trim();
    if (text) return text.slice(0, 80);
  }
  return "";
}

function textList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textList);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return ["displayName", "name", "formatted", "givenName", "familyName"].flatMap((key) => textList(record[key]));
}

async function contactPhoto(value: unknown) {
  for (const blob of photoBlobs(value)) {
    const file = await snapshotContactPhoto(blob);
    if (file) return file;
  }
  return null;
}

function photoBlobs(value: unknown): Blob[] {
  if (isBlob(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(photoBlobs);
  if (!value || typeof value !== "object" || !("length" in value)) return [];
  const length = (value as { length?: unknown }).length;
  if (typeof length !== "number" || length <= 0 || length > 5) return [];
  return Array.from({ length }, (_, index) => (value as Record<number, unknown>)[index]).flatMap(photoBlobs);
}

async function snapshotContactPhoto(blob: Blob) {
  try {
    const drawn = await drawContactPhoto(blob);
    if (drawn) return drawn;
    const bytes = await within(blob.arrayBuffer(), 1500);
    if (!bytes || bytes.byteLength === 0) return null;
    const type = blob.type.toLowerCase() === "image/png" ? "image/png" : blob.type.toLowerCase() === "image/webp" ? "image/webp" : "image/jpeg";
    const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    return new File([bytes], `contact.${extension}`, { type });
  } catch {
    return null;
  }
}

async function drawContactPhoto(blob: Blob) {
  if (typeof createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await within(createImageBitmap(blob), 1500);
  } catch {
    return null;
  }
  if (!bitmap) return null;
  if (bitmap.width < 1 || bitmap.height < 1) {
    bitmap.close();
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    const output = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92));
    if (!output || output.size === 0) return null;
    return new File([output], "contact.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

function within<T>(promise: Promise<T>, ms: number) {
  return new Promise<T | null>((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

function isBlob(value: unknown): value is Blob {
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
