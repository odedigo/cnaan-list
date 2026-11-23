"use client";

/** Hebrew person card: the saved details, and a form that edits them. */

import { useState } from "react";

import { TrashIcon, UnlinkIcon } from "@/components/icons";
import { UNION_STATUSES, unionStatusLabel, type PersonDraft, type UnionStatus } from "@/lib/family-trees";

export type PersonCard = PersonDraft & {
  xref: string;
  personId: string | null;
};

export type PersonRelative = { xref: string; label: string; otherParent?: string };

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
  onDelete,
  onOpenRelative,
}: {
  person: PersonCard;
  relatives: { parents: PersonRelative[]; spouses: PersonSpouse[]; children: PersonRelative[] };
  onClose: () => void;
  onSave: (draft: PersonDraft) => Promise<void>;
  onAddParents?: () => Promise<void>;
  onAddChild?: () => Promise<void>;
  onAddSpouse?: (status: UnionStatus) => Promise<void>;
  onSetSpouseStatus?: (xref: string, status: UnionStatus) => Promise<void>;
  onRemoveParent?: (xref: string) => Promise<void>;
  onRemoveSpouse?: (xref: string) => Promise<void>;
  onRemoveChild?: (xref: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onOpenRelative?: (xref: string) => void;
}) {
  const [draft, setDraft] = useState<PersonDraft>(person);
  const [tab, setTab] = useState<PersonTab>("details");
  const [spouseStatus, setSpouseStatus] = useState<UnionStatus>("married");
  const [confirming, setConfirming] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = `${draft.given_name} ${draft.surname}`.replace(/\s+/g, " ").trim() || `${draft.hebrew_given} ${draft.hebrew_surname}`.replace(/\s+/g, " ").trim() || "ללא שם";

  function setField<Key extends keyof PersonDraft>(key: Key, value: PersonDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function addRelative(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    void action().catch((reason: unknown) => setError(reason instanceof Error && reason.message ? reason.message : "לא ניתן לשמור")).finally(() => setBusy(false));
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-2" role="dialog" aria-modal="true" aria-label={title}>
      <form
        className="flex flex-col overflow-hidden rounded-2xl bg-white p-4 text-start"
        style={{ width: "min(1040px, calc(100vw - 1rem))", height: "min(720px, calc(100dvh - 1rem))", fontSize: "1rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          void onSave(draft)
            .catch((reason: unknown) => setError(reason instanceof Error && reason.message ? reason.message : "לא ניתן לשמור"))
            .finally(() => setBusy(false));
        }}
      >
        <h3 className="truncate text-lg font-semibold">{title}</h3>
        <div role="tablist" aria-label="פרטי האדם" className="mt-3 flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-200">
          {personTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className="shrink-0 px-3 py-2 font-medium"
              style={{ borderBottom: tab === item.id ? "3px solid var(--teal)" : "3px solid transparent", color: tab === item.id ? "#171717" : "#737373" }}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {tab === "details" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="שם פרטי" value={draft.given_name} maxLength={80} onChange={(value) => setField("given_name", value)} />
              <Field label="שם משפחה" value={draft.surname} maxLength={80} onChange={(value) => setField("surname", value)} />
              <Field label="שם פרטי בעברית" value={draft.hebrew_given} maxLength={80} onChange={(value) => setField("hebrew_given", value)} />
              <Field label="שם משפחה בעברית" value={draft.hebrew_surname} maxLength={80} onChange={(value) => setField("hebrew_surname", value)} />
              <Field label="כינוי" value={draft.nickname} maxLength={120} onChange={(value) => setField("nickname", value)} />
              <Field label="כתובת" value={draft.address} maxLength={500} onChange={(value) => setField("address", value)} />
              <Field label="עיר" value={draft.city} maxLength={120} onChange={(value) => setField("city", value)} />
              <Field label="מדינה" value={draft.country} maxLength={120} onChange={(value) => setField("country", value)} />
              <Field label="דוא״ל" value={draft.email} maxLength={200} ltr onChange={(value) => setField("email", value)} />
              <label className="block">
                <span className="text-neutral-600">מין</span>
                <select className="mt-1 w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none" style={{ fontSize: "1rem" }} value={draft.sex} onChange={(event) => setField("sex", event.target.value as PersonDraft["sex"])}>
                  <option value="m">זכר</option>
                  <option value="f">נקבה</option>
                  <option value="u">לא ידוע</option>
                </select>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="size-5" checked={draft.deceased} onChange={(event) => setField("deceased", event.target.checked)} />
                <span>נפטר/ה</span>
              </label>
            </div>
          ) : null}
          {tab === "dates" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField label="תאריך לידה" value={draft.birth_date} onChange={(value) => setField("birth_date", value)} />
              <Field label="מקום לידה" value={draft.birth_place} maxLength={120} onChange={(value) => setField("birth_place", value)} />
              <DateField label="תאריך פטירה" value={draft.death_date} onChange={(value) => setDraft((current) => ({ ...current, death_date: value, deceased: value.trim() ? true : current.deceased }))} />
              <Field label="מקום פטירה" value={draft.death_place} maxLength={120} onChange={(value) => setField("death_place", value)} />
              <Field label="סיבת פטירה" value={draft.cause_of_death} maxLength={200} onChange={(value) => setField("cause_of_death", value)} />
            </div>
          ) : null}
          {tab === "family" ? (
            <div className="grid gap-6">
              <section>
                <p className="text-neutral-600">הורים</p>
                {relatives.parents.length === 0 ? <p className="mt-2 text-neutral-500">אין</p> : null}
                <ul className="mt-2 flex flex-col gap-2">
                  {relatives.parents.map((relative) => (
                    <li key={relative.xref} className="flex items-center gap-2">
                      <button type="button" className="min-w-0 flex-1 truncate rounded-xl bg-neutral-100 px-3 py-2 text-start" onClick={() => onOpenRelative?.(relative.xref)}>{relative.label}</button>
                      {onRemoveParent ? <RemoveLink label={`ניתוק הקשר עם ${relative.label}`} disabled={busy} onClick={() => setUnlinkTarget({ label: relative.label, run: () => onRemoveParent(relative.xref) })} /> : null}
                    </li>
                  ))}
                </ul>
                {onAddParents ? (
                  <button type="button" className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-800 disabled:opacity-40" disabled={busy || relatives.parents.length > 0} onClick={() => addRelative(onAddParents)}>
                    הוספת הורים
                  </button>
                ) : null}
              </section>
              <section>
                <p className="text-neutral-600">בן/בת זוג</p>
                {relatives.spouses.length === 0 ? <p className="mt-2 text-neutral-500">אין</p> : null}
                <ul className="mt-2 flex flex-col gap-3">
                  {relatives.spouses.map((relative) => (
                    <li key={relative.xref} className="flex items-center gap-2">
                      <button type="button" className="min-w-0 flex-1 truncate rounded-xl bg-neutral-100 px-3 py-2 text-start" onClick={() => onOpenRelative?.(relative.xref)}>{relative.label}</button>
                      <div className="w-48 shrink-0">
                        <StatusSelect label={`סטטוס של ${relative.label}`} value={relative.status} disabled={busy} onChange={(status) => onSetSpouseStatus && addRelative(() => onSetSpouseStatus(relative.xref, status))} />
                      </div>
                      {onRemoveSpouse ? <RemoveLink label={`ניתוק הקשר עם ${relative.label}`} disabled={busy} onClick={() => setUnlinkTarget({ label: relative.label, run: () => onRemoveSpouse(relative.xref) })} /> : null}
                    </li>
                  ))}
                </ul>
                {onAddSpouse ? (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <StatusSelect label="סטטוס הזוגיות" value={spouseStatus} disabled={busy} onChange={setSpouseStatus} />
                    </div>
                    <button type="button" className="shrink-0 rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-800 disabled:opacity-40" disabled={busy} onClick={() => addRelative(() => onAddSpouse(spouseStatus))}>
                      הוספת בן/בת זוג
                    </button>
                  </div>
                ) : null}
              </section>
              <section>
                <p className="text-neutral-600">ילדים</p>
                {relatives.children.length === 0 ? <p className="mt-2 text-neutral-500">אין</p> : null}
                <ul className="mt-2 flex flex-col gap-2">
                  {relatives.children.map((relative) => (
                    <li key={relative.xref} className="flex items-center gap-2">
                      <button type="button" className="min-w-0 flex-1 rounded-xl bg-neutral-100 px-3 py-2 text-start" onClick={() => onOpenRelative?.(relative.xref)}>
                        <span className="block truncate">{relative.label}</span>
                        {relative.otherParent ? <span className="block truncate text-sm text-neutral-500">ההורה השני: {relative.otherParent}</span> : null}
                      </button>
                      {onRemoveChild ? <RemoveLink label={`ניתוק הקשר עם ${relative.label}`} disabled={busy} onClick={() => setUnlinkTarget({ label: relative.label, run: () => onRemoveChild(relative.xref) })} /> : null}
                    </li>
                  ))}
                </ul>
                {onAddChild ? (
                  <button type="button" className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-800 disabled:opacity-40" disabled={busy} onClick={() => addRelative(onAddChild)}>
                    הוספת ילד
                  </button>
                ) : null}
              </section>
            </div>
          ) : null}
          {tab === "note" ? (
            <div className="grid gap-4">
              <Area label="עיסוק" value={draft.occupation} maxLength={1000} onChange={(value) => setField("occupation", value)} />
              <Area label="הערה" value={draft.note} maxLength={1000} onChange={(value) => setField("note", value)} />
              <Area label="מקור" value={draft.source} maxLength={2000} onChange={(value) => setField("source", value)} />
              <Area label="מדיה" value={draft.media} maxLength={2000} onChange={(value) => setField("media", value)} />
            </div>
          ) : null}
        </div>
        {person.personId ? null : <p className="mt-3 shrink-0 text-sm text-neutral-500">השינויים נשמרים רק בתצוגה הזו</p>}
        {error ? <p className="mt-3 shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-3 flex shrink-0 items-center gap-2">
          <button type="submit" className="rounded-xl bg-[var(--teal)] px-3 py-2 font-medium text-white disabled:opacity-40" disabled={busy}>שמירה</button>
          <button type="button" className="rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-700" onClick={onClose}>ביטול</button>
          {onDelete ? (
            <button type="button" className="ms-auto grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-700 disabled:opacity-40" aria-label="מחיקה" disabled={busy} onClick={() => setConfirming(true)}>
              <TrashIcon className="size-5" />
            </button>
          ) : null}
        </div>
      </form>
      {unlinkTarget ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="ניתוק קשר">
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
                    setError(reason instanceof Error && reason.message ? reason.message : "לא ניתן למחוק את הקשר");
                  })
                  .finally(() => setBusy(false));
              }}
            >
              ניתוק
            </button>
            <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={() => setUnlinkTarget(null)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {confirming ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="מחיקת אדם">
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
                    setError(reason instanceof Error && reason.message ? reason.message : "לא ניתן למחוק את האדם");
                  })
                  .finally(() => setBusy(false));
              }}
            >
              מחיקה
            </button>
            <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={() => setConfirming(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type PersonTab = "details" | "dates" | "family" | "note";

const personTabs: { id: PersonTab; label: string }[] = [
  { id: "details", label: "פרטים" },
  { id: "dates", label: "תאריכים" },
  { id: "family", label: "משפחה" },
  { id: "note", label: "הערה" },
];

function RemoveLink({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full text-neutral-700 disabled:opacity-40" aria-label={label} disabled={disabled} onClick={onClick}>
      <UnlinkIcon className="size-5" />
    </button>
  );
}

function StatusSelect({ label, value, disabled, onChange }: { label: string; value: UnionStatus; disabled: boolean; onChange: (status: UnionStatus) => void }) {
  return (
    <select className="w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none disabled:opacity-40" style={{ fontSize: "1rem" }} aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as UnionStatus)}>
      {UNION_STATUSES.map((status) => (
        <option key={status} value={status}>{unionStatusLabel(status)}</option>
      ))}
    </select>
  );
}

function Field({ label, value, maxLength, ltr = false, onChange }: { label: string; value: string; maxLength: number; ltr?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-neutral-600">{label}</span>
      <input value={value} maxLength={maxLength} dir={ltr ? "ltr" : undefined} onChange={(event) => onChange(event.target.value)} className={`mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none ${ltr ? "text-end" : ""}`} style={{ fontSize: "1rem" }} aria-label={label} />
    </label>
  );
}

function Area({ label, value, maxLength, onChange }: { label: string; value: string; maxLength: number; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-neutral-600">{label}</span>
      <textarea value={value} maxLength={maxLength} rows={4} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none" style={{ fontSize: "1rem" }} aria-label={label} />
    </label>
  );
}

const DATE_MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const iso = calendarValue(value);
  return (
    <label className="block">
      <span className="text-neutral-600">{label}</span>
      <input type="date" value={iso} dir="ltr" onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-end outline-none" style={{ fontSize: "1rem" }} aria-label={label} />
      {value.trim() && !iso ? <span dir="ltr" className="mt-1 block text-end text-sm text-neutral-500">{value}</span> : null}
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
