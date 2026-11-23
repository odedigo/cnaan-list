"use client";

/** Hebrew person card: the saved details, and a form that edits them. */

import { useEffect, useRef, useState } from "react";

import { TrashIcon, UnlinkIcon } from "@/components/icons";
import {
  UNION_STATUSES,
  unionStatusLabel,
  type PersonDraft,
  type UnionStatus,
} from "@/lib/family-trees";

export type PersonCard = PersonDraft & {
  xref: string;
  personId: string | null;
  linkTree: string;
  linkPerson: string;
};

export type TreeChoice = { id: string; name: string };

export type TreePersonHit = { id: string; label: string };

export type PersonPhoto = { id: string; src: string; thumbnail: boolean };

export type PersonRelative = {
  xref: string;
  label: string;
  otherParent?: string;
};

export type PersonSpouse = PersonRelative & { status: UnionStatus };

export function FamilyPersonSheet({
  person,
  relatives,
  onClose,
  onSave,
  onAddParents,
  onAddChild,
  onAddSpouse,
  onSetSpouseStatus,
  onRemoveParent,
  onRemoveSpouse,
  onRemoveChild,
  onRemoveAncestors,
  otherTrees,
  onLoadTreePeople,
  onLinkPerson,
  onUnlinkPerson,
  onDelete,
  photos,
  onAddPhoto,
  onRemovePhoto,
  onSetThumbnail,
  onOpenRelative,
}: {
  person: PersonCard;
  relatives: {
    parents: PersonRelative[];
    spouses: PersonSpouse[];
    children: PersonRelative[];
  };
  onClose: () => void;
  onSave: (draft: PersonDraft) => Promise<void>;
  onAddParents?: () => Promise<void>;
  onAddChild?: () => Promise<void>;
  onAddSpouse?: (status: UnionStatus) => Promise<void>;
  onSetSpouseStatus?: (xref: string, status: UnionStatus) => Promise<void>;
  onRemoveParent?: (xref: string) => Promise<void>;
  onRemoveSpouse?: (xref: string) => Promise<void>;
  onRemoveChild?: (xref: string) => Promise<void>;
  onRemoveAncestors?: () => Promise<void>;
  otherTrees: TreeChoice[];
  onLoadTreePeople: (treeId: string) => Promise<TreePersonHit[]>;
  onLinkPerson: (treeId: string, personId: string) => Promise<void>;
  onUnlinkPerson: () => Promise<void>;
  onDelete?: () => Promise<void>;
  photos: PersonPhoto[];
  onAddPhoto: (file: File) => Promise<void>;
  onRemovePhoto: (photoId: string) => Promise<void>;
  onSetThumbnail: (photoId: string) => Promise<void>;
  onOpenRelative?: (xref: string) => void;
}) {
  const [draft, setDraft] = useState<PersonDraft>(person);
  const [tab, setTab] = useState<PersonTab>("details");
  const [spouseStatus, setSpouseStatus] = useState<UnionStatus>("married");
  const [confirming, setConfirming] = useState(false);
  const [confirmingAncestors, setConfirmingAncestors] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{
    label: string;
    run: () => Promise<void>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title =
    `${draft.given_name} ${draft.surname}`.replace(/\s+/g, " ").trim() ||
    `${draft.hebrew_given} ${draft.hebrew_surname}`
      .replace(/\s+/g, " ")
      .trim() ||
    "ללא שם";

  function setField<Key extends keyof PersonDraft>(
    key: Key,
    value: PersonDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function addRelative(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    void action()
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error && reason.message
            ? reason.message
            : "לא ניתן לשמור",
        ),
      )
      .finally(() => setBusy(false));
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-2"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <form
        className="flex flex-col overflow-hidden rounded-2xl bg-white p-4 text-start"
        style={{
          width: "min(1040px, calc(100vw - 1rem))",
          height: "min(720px, calc(100dvh - 1rem))",
          fontSize: "1rem",
        }}
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          void onSave(draft)
            .catch((reason: unknown) =>
              setError(
                reason instanceof Error && reason.message
                  ? reason.message
                  : "לא ניתן לשמור",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <h3 className="truncate text-lg font-semibold">{title}</h3>
        <div
          role="tablist"
          aria-label="פרטי האדם"
          className="mt-3 flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-200"
        >
          {personTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className="shrink-0 px-3 py-2 font-medium"
              style={{
                borderBottom:
                  tab === item.id
                    ? "3px solid var(--teal)"
                    : "3px solid transparent",
                color: tab === item.id ? "#171717" : "#737373",
              }}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {tab === "details" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="שם פרטי"
                value={draft.given_name}
                maxLength={80}
                onChange={(value) => setField("given_name", value)}
              />
              <Field
                label="שם משפחה"
                value={draft.surname}
                maxLength={80}
                onChange={(value) => setField("surname", value)}
              />
              <Field
                label="שם פרטי בעברית"
                value={draft.hebrew_given}
                maxLength={80}
                onChange={(value) => setField("hebrew_given", value)}
              />
              <Field
                label="שם משפחה בעברית"
                value={draft.hebrew_surname}
                maxLength={80}
                onChange={(value) => setField("hebrew_surname", value)}
              />
              <Field
                label="כינוי"
                value={draft.nickname}
                maxLength={120}
                onChange={(value) => setField("nickname", value)}
              />
              <Field
                label="כתובת"
                value={draft.address}
                maxLength={500}
                onChange={(value) => setField("address", value)}
              />
              <Field
                label="עיר"
                value={draft.city}
                maxLength={120}
                onChange={(value) => setField("city", value)}
              />
              <Field
                label="מדינה"
                value={draft.country}
                maxLength={120}
                onChange={(value) => setField("country", value)}
              />
              <Field
                label="דוא״ל"
                value={draft.email}
                maxLength={200}
                ltr
                onChange={(value) => setField("email", value)}
              />
              <label className="block">
                <span className="text-neutral-600">מין</span>
                <select
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none"
                  style={{ fontSize: "1rem" }}
                  value={draft.sex}
                  onChange={(event) =>
                    setField("sex", event.target.value as PersonDraft["sex"])
                  }
                >
                  <option value="m">זכר</option>
                  <option value="f">נקבה</option>
                  <option value="u">לא ידוע</option>
                </select>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={draft.deceased}
                  onChange={(event) =>
                    setField("deceased", event.target.checked)
                  }
                />
                <span>נפטר/ה</span>
              </label>
            </div>
          ) : null}
          {tab === "photos" ? (
            <PersonPhotos
              photos={photos}
              busy={busy}
              onAdd={(file) => addRelative(() => onAddPhoto(file))}
              onRemove={(id) => addRelative(() => onRemovePhoto(id))}
              onThumbnail={(id) => addRelative(() => onSetThumbnail(id))}
            />
          ) : null}
          {tab === "dates" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField
                label="תאריך לידה"
                value={draft.birth_date}
                onChange={(value) => setField("birth_date", value)}
              />
              <Field
                label="מקום לידה"
                value={draft.birth_place}
                maxLength={120}
                onChange={(value) => setField("birth_place", value)}
              />
              <DateField
                label="תאריך פטירה"
                value={draft.death_date}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    death_date: value,
                    deceased: value.trim() ? true : current.deceased,
                  }))
                }
              />
              <Field
                label="מקום פטירה"
                value={draft.death_place}
                maxLength={120}
                onChange={(value) => setField("death_place", value)}
              />
              <Field
                label="סיבת פטירה"
                value={draft.cause_of_death}
                maxLength={200}
                onChange={(value) => setField("cause_of_death", value)}
              />
            </div>
          ) : null}
          {tab === "family" ? (
            <div className="grid gap-6">
              <section>
                <p className="text-neutral-600">הורים</p>
                {relatives.parents.length === 0 ? (
                  <p className="mt-2 text-neutral-500">אין</p>
                ) : null}
                <ul className="mt-2 flex flex-col gap-2">
                  {relatives.parents.map((relative) => (
                    <li key={relative.xref} className="flex items-center gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate rounded-xl bg-neutral-100 px-3 py-2 text-start"
                        onClick={() => onOpenRelative?.(relative.xref)}
                      >
                        {relative.label}
                      </button>
                      {onRemoveParent ? (
                        <RemoveLink
                          label={`ניתוק הקשר עם ${relative.label}`}
                          disabled={busy}
                          onClick={() =>
                            setUnlinkTarget({
                              label: relative.label,
                              run: () => onRemoveParent(relative.xref),
                            })
                          }
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
                {onAddParents ? (
                  <button
                    type="button"
                    className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-800 disabled:opacity-40"
                    disabled={busy || relatives.parents.length > 0}
                    onClick={() => addRelative(onAddParents)}
                  >
                    הוספת הורים
                  </button>
                ) : null}
                {onRemoveAncestors ? (
                  <button
                    type="button"
                    className="mt-3 rounded-xl bg-red-50 px-3 py-2 font-medium text-red-700 disabled:opacity-40"
                    disabled={busy || relatives.parents.length === 0}
                    onClick={() => setConfirmingAncestors(true)}
                  >
                    מחיקת כל המשפחה מלמעלה
                  </button>
                ) : null}
              </section>
              <section>
                <p className="text-neutral-600">בן/בת זוג</p>
                {relatives.spouses.length === 0 ? (
                  <p className="mt-2 text-neutral-500">אין</p>
                ) : null}
                <ul className="mt-2 flex flex-col gap-3">
                  {relatives.spouses.map((relative) => (
                    <li key={relative.xref} className="flex items-center gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate rounded-xl bg-neutral-100 px-3 py-2 text-start"
                        onClick={() => onOpenRelative?.(relative.xref)}
                      >
                        {relative.label}
                      </button>
                      <div className="w-48 shrink-0">
                        <StatusSelect
                          label={`סטטוס של ${relative.label}`}
                          value={relative.status}
                          disabled={busy}
                          onChange={(status) =>
                            onSetSpouseStatus &&
                            addRelative(() =>
                              onSetSpouseStatus(relative.xref, status),
                            )
                          }
                        />
                      </div>
                      {onRemoveSpouse ? (
                        <RemoveLink
                          label={`ניתוק הקשר עם ${relative.label}`}
                          disabled={busy}
                          onClick={() =>
                            setUnlinkTarget({
                              label: relative.label,
                              run: () => onRemoveSpouse(relative.xref),
                            })
                          }
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
                {onAddSpouse ? (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <StatusSelect
                        label="סטטוס הזוגיות"
                        value={spouseStatus}
                        disabled={busy}
                        onChange={setSpouseStatus}
                      />
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-800 disabled:opacity-40"
                      disabled={busy}
                      onClick={() =>
                        addRelative(() => onAddSpouse(spouseStatus))
                      }
                    >
                      הוספת בן/בת זוג
                    </button>
                  </div>
                ) : null}
              </section>
              <section>
                <p className="text-neutral-600">ילדים</p>
                {relatives.children.length === 0 ? (
                  <p className="mt-2 text-neutral-500">אין</p>
                ) : null}
                <ul className="mt-2 flex flex-col gap-2">
                  {relatives.children.map((relative) => (
                    <li key={relative.xref} className="flex items-center gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded-xl bg-neutral-100 px-3 py-2 text-start"
                        onClick={() => onOpenRelative?.(relative.xref)}
                      >
                        <span className="block truncate">{relative.label}</span>
                        {relative.otherParent ? (
                          <span className="block truncate text-sm text-neutral-500">
                            ההורה השני: {relative.otherParent}
                          </span>
                        ) : null}
                      </button>
                      {onRemoveChild ? (
                        <RemoveLink
                          label={`ניתוק הקשר עם ${relative.label}`}
                          disabled={busy}
                          onClick={() =>
                            setUnlinkTarget({
                              label: relative.label,
                              run: () => onRemoveChild(relative.xref),
                            })
                          }
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
                {onAddChild ? (
                  <button
                    type="button"
                    className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-800 disabled:opacity-40"
                    disabled={busy}
                    onClick={() => addRelative(onAddChild)}
                  >
                    הוספת ילד
                  </button>
                ) : null}
              </section>
            </div>
          ) : null}
          {tab === "link" ? (
            <PersonTreeLink
              linkTree={person.linkTree}
              linkPerson={person.linkPerson}
              trees={otherTrees}
              busy={busy}
              onLoadPeople={onLoadTreePeople}
              onLink={(treeId, personId) => addRelative(() => onLinkPerson(treeId, personId))}
              onUnlink={() => addRelative(onUnlinkPerson)}
            />
          ) : null}
          {tab === "note" ? (
            <div className="grid gap-4">
              <Area
                label="עיסוק"
                value={draft.occupation}
                maxLength={1000}
                onChange={(value) => setField("occupation", value)}
              />
              <Area
                label="הערה"
                value={draft.note}
                maxLength={1000}
                onChange={(value) => setField("note", value)}
              />
              <Area
                label="מקור"
                value={draft.source}
                maxLength={2000}
                onChange={(value) => setField("source", value)}
              />
              <Area
                label="מדיה"
                value={draft.media}
                maxLength={2000}
                onChange={(value) => setField("media", value)}
              />
            </div>
          ) : null}
        </div>
        {person.personId ? null : (
          <p className="mt-3 shrink-0 text-sm text-neutral-500">
            השינויים נשמרים רק בתצוגה הזו
          </p>
        )}
        {error ? (
          <p className="mt-3 shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex shrink-0 items-center gap-2">
          <button
            type="submit"
            className="rounded-xl bg-[var(--teal)] px-3 py-2 font-medium text-white disabled:opacity-40"
            disabled={busy}
          >
            שמירה
          </button>
          <button
            type="button"
            className="rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-700"
            onClick={onClose}
          >
            ביטול
          </button>
          {onDelete ? (
            <button
              type="button"
              className="ms-auto grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-700 disabled:opacity-40"
              aria-label="מחיקה"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              <TrashIcon className="size-5" />
            </button>
          ) : null}
        </div>
      </form>
      {unlinkTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="ניתוק קשר"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-start">
            <p className="text-sm font-medium">{`לנתק את הקשר עם "${unlinkTarget.label}"?`}</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                const run = unlinkTarget.run;
                setBusy(true);
                setError("");
                void run()
                  .then(() => setUnlinkTarget(null))
                  .catch((reason: unknown) => {
                    setUnlinkTarget(null);
                    setError(
                      reason instanceof Error && reason.message
                        ? reason.message
                        : "לא ניתן למחוק את הקשר",
                    );
                  })
                  .finally(() => setBusy(false));
              }}
            >
              ניתוק
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700"
              onClick={() => setUnlinkTarget(null)}
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {confirmingAncestors ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="מחיקת האבות"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-start">
            <p className="text-sm font-medium">{`למחוק את כל האבות מעל "${title}"?`}</p>
            <p className="mt-2 text-sm text-neutral-600">
              גם אנשים מוסתרים בעץ האבות יימחקו. האדם, בן או בת הזוג והילדים
              יישארו.
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-red-600 py-3 font-medium text-white disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                if (!onRemoveAncestors) return;
                setBusy(true);
                setError("");
                void onRemoveAncestors()
                  .then(() => setConfirmingAncestors(false))
                  .catch((reason: unknown) => {
                    setConfirmingAncestors(false);
                    setError(
                      reason instanceof Error && reason.message
                        ? reason.message
                        : "לא ניתן למחוק את האבות",
                    );
                  })
                  .finally(() => setBusy(false));
              }}
            >
              מחיקה
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700"
              onClick={() => setConfirmingAncestors(false)}
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {confirming ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="מחיקת אדם"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-start">
            <p className="text-sm font-medium">{`למחוק את "${title}"?`}</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-red-600 py-3 font-medium text-white disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                if (!onDelete) return;
                setBusy(true);
                setError("");
                void onDelete()
                  .then(() => setConfirming(false))
                  .catch((reason: unknown) => {
                    setConfirming(false);
                    setError(
                      reason instanceof Error && reason.message
                        ? reason.message
                        : "לא ניתן למחוק את האדם",
                    );
                  })
                  .finally(() => setBusy(false));
              }}
            >
              מחיקה
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700"
              onClick={() => setConfirming(false)}
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type PersonTab = "details" | "photos" | "dates" | "family" | "link" | "note";

const personTabs: { id: PersonTab; label: string }[] = [
  { id: "details", label: "פרטים" },
  { id: "photos", label: "תמונות" },
  { id: "dates", label: "תאריכים" },
  { id: "family", label: "משפחה" },
  { id: "link", label: "קישור" },
  { id: "note", label: "הערה" },
];

function PersonPhotos({
  photos,
  busy,
  onAdd,
  onRemove,
  onThumbnail,
}: {
  photos: PersonPhoto[];
  busy: boolean;
  onAdd: (file: File) => void;
  onRemove: (photoId: string) => void;
  onThumbnail: (photoId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const [openId, setOpenId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const open = photos.find((photo) => photo.id === openId) ?? null;

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (busy || photos.length >= 12) return;
      const file = clipboardImage(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      onAddRef.current(file);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [busy, photos.length]);

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onAdd(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-800 disabled:opacity-40"
          disabled={busy || photos.length >= 12}
          onClick={() => fileRef.current?.click()}
        >
          הוספת תמונה
        </button>
      </div>
      <p className="mt-2 text-sm text-neutral-500">
        אפשר להדביק תמונה עם <span dir="ltr">Ctrl+V</span>. הכוכב קובע את התמונה על הכרטיס.
      </p>
      {photos.length === 0 ? <p className="mt-4 text-sm text-neutral-500">אין תמונות</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo) => (
          <div key={photo.id} className="overflow-hidden rounded-xl border border-neutral-200">
            <div className="relative">
              <button
                type="button"
                className="block w-full"
                aria-label="הגדלת התמונה"
                onClick={() => setOpenId(photo.id)}
              >
                <img src={photo.src} alt="" className="aspect-square w-full object-cover" />
              </button>
              <button
                type="button"
                className="absolute grid size-8 place-items-center rounded-full bg-white/90 shadow disabled:opacity-40"
                style={{ insetInlineStart: "0.35rem", top: "0.35rem" }}
                aria-label={photo.thumbnail ? "תמונת הכרטיס" : "קביעה כתמונת הכרטיס"}
                aria-pressed={photo.thumbnail}
                disabled={busy}
                onClick={() => {
                  if (!photo.thumbnail) onThumbnail(photo.id);
                }}
              >
                <StarIcon filled={photo.thumbnail} />
              </button>
            </div>
            <button
              type="button"
              className="w-full px-2 py-2 text-sm text-red-700 disabled:opacity-40"
              disabled={busy}
              onClick={() => setRemoving(photo.id)}
            >
              הסרה
            </button>
          </div>
        ))}
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="תמונה"
          onClick={() => setOpenId(null)}
        >
          <img src={open.src} alt="" className="max-h-[80vh] max-w-full rounded-lg object-contain" />
        </div>
      ) : null}
      {removing ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="מחיקת תמונה">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-start">
            <p className="text-sm font-medium">למחוק את התמונה?</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-red-600 py-3 font-medium text-white disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                const id = removing;
                setRemoving(null);
                onRemove(id);
              }}
            >
              מחיקה
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700"
              onClick={() => setRemoving(null)}
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill={filled ? "#b45309" : "none"} stroke="#b45309" strokeWidth="1.8">
      <polygon points="12,2.6 14.9,8.7 21.5,9.6 16.7,14.2 17.9,20.8 12,17.6 6.1,20.8 7.3,14.2 2.5,9.6 9.1,8.7" strokeLinejoin="round" />
    </svg>
  );
}

function clipboardImage(data: DataTransfer | null) {
  if (!data) return null;
  for (const file of data.files) {
    if (file.type.startsWith("image/") && file.size > 0) return file;
  }
  for (const item of data.items) {
    if (item.kind !== "file" || (item.type && !item.type.startsWith("image/"))) continue;
    const file = item.getAsFile();
    if (file && file.size > 0 && (!file.type || file.type.startsWith("image/"))) return file;
  }
  return null;
}

function PersonTreeLink({
  linkTree,
  linkPerson,
  trees,
  busy,
  onLoadPeople,
  onLink,
  onUnlink,
}: {
  linkTree: string;
  linkPerson: string;
  trees: TreeChoice[];
  busy: boolean;
  onLoadPeople: (treeId: string) => Promise<TreePersonHit[]>;
  onLink: (treeId: string, personId: string) => void;
  onUnlink: () => void;
}) {
  const [treeId, setTreeId] = useState("");
  const [people, setPeople] = useState<TreePersonHit[]>([]);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<TreePersonHit | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const linked = Boolean(linkTree && linkPerson);
  const sourceId = linked ? linkTree : treeId;
  useEffect(() => {
    if (!sourceId) {
      setPeople([]);
      return;
    }
    let cancel = false;
    onLoadPeople(sourceId)
      .then((rows) => {
        if (!cancel) setPeople(rows);
      })
      .catch(() => {
        if (!cancel) setPeople([]);
      });
    return () => {
      cancel = true;
    };
  }, [onLoadPeople, sourceId]);
  const treeName = trees.find((tree) => tree.id === linkTree)?.name ?? "";
  const linkedLabel = people.find((person) => person.id === linkPerson)?.label ?? "";
  const needle = query.trim().toLocaleLowerCase("he");
  const matches = needle ? people.filter((person) => person.label.toLocaleLowerCase("he").includes(needle)).slice(0, 20) : [];
  const chosenTree = trees.find((tree) => tree.id === treeId)?.name ?? "";
  return (
    <div className="grid gap-4">
      <p className="text-neutral-600">מיזוג מהעץ האחר. האדם, בן או בת הזוג וכל מי שמתחתיו לא מועתקים.</p>
      {linked ? (
        <div className="rounded-xl bg-neutral-100 px-3 py-2">
          <p className="font-medium">{linkedLabel || "האדם לא נמצא בעץ"}</p>
          {treeName ? <p className="mt-1 text-neutral-600">{treeName}</p> : null}
          <button type="button" className="mt-3 rounded-xl bg-white px-3 py-2 font-medium text-red-700 disabled:opacity-40" disabled={busy} onClick={() => setConfirmUnlink(true)}>
            ניתוק
          </button>
        </div>
      ) : trees.length === 0 ? (
        <p className="text-neutral-500">אין עץ אחר</p>
      ) : (
        <>
          <label className="block">
            <span className="text-neutral-600">עץ אחר</span>
            <select
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none"
              style={{ fontSize: "1rem" }}
              value={treeId}
              onChange={(event) => {
                setTreeId(event.target.value);
                setQuery("");
              }}
            >
              <option value="">בחירת עץ</option>
              {trees.map((tree) => (
                <option key={tree.id} value={tree.id}>{tree.name}</option>
              ))}
            </select>
          </label>
          {treeId ? (
            <label className="block">
              <span className="text-neutral-600">חיפוש אדם</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none" style={{ fontSize: "1rem" }} aria-label="חיפוש אדם בעץ אחר" />
            </label>
          ) : null}
          {matches.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {matches.map((person) => (
                <li key={person.id}>
                  <button type="button" className="w-full truncate rounded-xl bg-neutral-100 px-3 py-2 text-start disabled:opacity-40" disabled={busy} onClick={() => setPending(person)}>
                    {person.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {pending ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="מיזוג עץ">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-start">
            <p className="text-sm font-medium">{`למזג את "${pending.label}" מהעץ "${chosenTree}"?`}</p>
            <p className="mt-2 text-sm text-neutral-600">תועתק כל המשפחה שמעליו. האדם עצמו, בן או בת הזוג וכל מי שמתחתיו לא יועתקו.</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                const personId = pending.id;
                setPending(null);
                void onLink(treeId, personId);
              }}
            >
              מיזוג
            </button>
            <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={() => setPending(null)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {confirmUnlink ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="ניתוק קישור">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-start">
            <p className="text-sm font-medium">לנתק את הקישור? האנשים שכבר מוזגו יישארו.</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                setConfirmUnlink(false);
                void onUnlink();
              }}
            >
              ניתוק
            </button>
            <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={() => setConfirmUnlink(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RemoveLink({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="grid size-9 shrink-0 place-items-center rounded-full text-neutral-700 disabled:opacity-40"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <UnlinkIcon className="size-5" />
    </button>
  );
}

function StatusSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: UnionStatus;
  disabled: boolean;
  onChange: (status: UnionStatus) => void;
}) {
  return (
    <select
      className="w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none disabled:opacity-40"
      style={{ fontSize: "1rem" }}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as UnionStatus)}
    >
      {UNION_STATUSES.map((status) => (
        <option key={status} value={status}>
          {unionStatusLabel(status)}
        </option>
      ))}
    </select>
  );
}

function Field({
  label,
  value,
  maxLength,
  ltr = false,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  ltr?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-neutral-600">{label}</span>
      <input
        value={value}
        maxLength={maxLength}
        dir={ltr ? "ltr" : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none ${ltr ? "text-end" : ""}`}
        style={{ fontSize: "1rem" }}
        aria-label={label}
      />
    </label>
  );
}

function Area({
  label,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-neutral-600">{label}</span>
      <textarea
        value={value}
        maxLength={maxLength}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none"
        style={{ fontSize: "1rem" }}
        aria-label={label}
      />
    </label>
  );
}

const DATE_MONTHS: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const iso = calendarValue(value);
  return (
    <label className="block">
      <span className="text-neutral-600">{label}</span>
      <input
        type="date"
        value={iso}
        dir="ltr"
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-end outline-none"
        style={{ fontSize: "1rem" }}
        aria-label={label}
      />
      {value.trim() && !iso ? (
        <span
          dir="ltr"
          className="mt-1 block text-end text-sm text-neutral-500"
        >
          {value}
        </span>
      ) : null}
    </label>
  );
}

function calendarValue(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  const month = match ? DATE_MONTHS[match[2].toUpperCase()] : "";
  if (!match || !month) return "";
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}
