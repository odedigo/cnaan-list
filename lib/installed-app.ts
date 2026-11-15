export function isInstalledApp() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

type PhoneContact = {
  name?: string[];
  icon?: Blob[];
};

type ContactPicker = {
  select: (properties: string[], options?: { multiple?: boolean }) => Promise<PhoneContact[]>;
  getProperties?: () => Promise<string[]>;
};

/** Contact picking exists only in the installed Android app. */
export function androidContactPicker() {
  if (typeof navigator === "undefined" || !isInstalledApp()) return null;
  if (!/Android/i.test(navigator.userAgent)) return null;
  const contacts = (navigator as Navigator & { contacts?: ContactPicker }).contacts;
  if (!contacts || typeof contacts.select !== "function") return null;
  return contacts;
}

export async function pickAndroidContact() {
  const picker = androidContactPicker();
  if (!picker) return null;
  const available = picker.getProperties ? await picker.getProperties() : ["name", "icon"];
  const properties = ["name", "icon"].filter((property) => available.includes(property));
  if (properties.length === 0) return null;
  const [contact] = await picker.select(properties, { multiple: false });
  if (!contact) return null;
  const name = contact.name?.map((value) => value.trim()).find(Boolean)?.slice(0, 80) ?? "";
  const icon = contact.icon?.find((blob) => blob.size > 0) ?? null;
  const image = icon ? contactImageFile(icon) : null;
  return { name, image };
}

function contactImageFile(blob: Blob) {
  const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `contact.${extension}`, { type });
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
