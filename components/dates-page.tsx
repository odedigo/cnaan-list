"use client";

/** Important events: birthdays, anniversaries, death anniversaries, and custom dates. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { AppHeader } from "@/components/app-header";
import { useDataTransfer } from "@/components/data-transfer";
import { CommentIcon, ImageIcon, UserIcon } from "@/components/icons";
import { ImagePicker } from "@/components/images";
import { useLists } from "@/components/lists-provider";
import { countdownText, eventDraftError, eventKinds, eventTypeLabel, eventYears, hebrewMonths, type EventDraft } from "@/lib/events";
import { androidContactPicker, pickAndroidContact, prepareAndroidContacts } from "@/lib/installed-app";
import type { AccountEvent, EventKind } from "@/lib/types";

type PickedContact = { token: number; name: string; image: File | null };

type Editor = { id: string | null; contact?: PickedContact };

export function DatesPage({ active }: { active: boolean }) {
  const lists = useLists();
  const transfer = useDataTransfer();
  const [editor, setEditor] = useState<Editor | null>(null);
  const contactToken = useRef(0);
  const busy = lists.saving || Boolean(transfer?.busy);
  const editing = editor?.id ? lists.events.find((event) => event.id === editor.id) ?? null : null;

  useEffect(() => {
    if (!active) setEditor(null);
  }, [active]);

  useEffect(() => {
    if (!editor?.id || !lists.eventsReady) return;
    if (!lists.events.some((event) => event.id === editor.id)) setEditor(null);
  }, [editor, lists.events, lists.eventsReady]);

  return (
    <div className="min-h-[calc(100dvh-6rem)]">
      {lists.error ? <p className="mx-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{lists.error}</p> : null}
      <AppHeader
        title="ארועים"
        actionsEnabled={lists.eventsReady && !busy}
        onHeaderPlus={() => setEditor({ id: null })}
        headerPlusLabel="הוספת אירוע"
      />
      {!lists.eventsReady ? (
        <p className="px-4 py-8 text-center text-neutral-500">לא ניתן לטעון את הארועים</p>
      ) : lists.events.length === 0 ? (
        <p className="px-4 py-8 text-center text-neutral-500">אין ארועים</p>
      ) : (
        <div className="flex flex-col gap-2 py-2">
          {lists.events.map((event) => (
            <EventStrip key={event.id} event={event} src={eventImage(lists.imageSrc, event)} onOpen={() => setEditor({ id: event.id })} />
          ))}
        </div>
      )}
      {editor ? (
        <EventDialog
          event={editing}
          src={editing ? eventImage(lists.imageSrc, editing) : null}
          contact={editor.contact ?? null}
          onContact={(name, image) => {
            contactToken.current += 1;
            const contact = { token: contactToken.current, name, image };
            setEditor((current) => (current && current.id == null ? { ...current, contact } : current));
          }}
          onClose={() => setEditor(null)}
          onSave={async (draft, imageFile, removeImage) => {
            const saved = await lists.saveEvent({ ...draft, id: editing?.id, imageFile, removeImage });
            if (saved) setEditor(null);
            return saved;
          }}
          onDelete={
            editing
              ? async () => {
                  await lists.deleteEvent(editing.id);
                  setEditor(null);
                }
              : null
          }
        />
      ) : null}
    </div>
  );
}

function eventImage(imageSrc: (kind: "event", id: string, path: string | null) => string | null, event: AccountEvent) {
  return imageSrc("event", event.id, event.image_path);
}

function EventStrip({ event, src, onOpen }: { event: AccountEvent; src: string | null; onOpen: () => void }) {
  const label = eventTypeLabel(event);
  const countdown = countdownText(event.month, event.day);
  const years = eventYears(event);
  const hasComment = event.comments.trim().length > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full items-center gap-2 px-2 py-2 text-start"
      style={{ gridTemplateColumns: "4.75rem minmax(0, 1fr) 4.5rem 4.25rem", background: "linear-gradient(180deg, #e7e7e7 0%, #f4f4f4 100%)" }}
      aria-label={`${event.name}, ${label}, ${countdown}${hasComment ? ", יש הערה" : ""}`}
    >
      <span className="relative block h-[5.5rem] overflow-hidden bg-neutral-300 text-neutral-500">
        {src ? <img src={src} alt="" className="absolute inset-0 size-full object-cover" /> : <ImageIcon className="absolute inset-0 m-auto size-8" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1">
          <span className="truncate text-lg font-semibold leading-tight">{event.name}</span>
          {hasComment ? <CommentIcon className="size-4 shrink-0 text-neutral-500" /> : null}
        </span>
        <span className="mt-0.5 block text-sm leading-tight">{label}</span>
        <span className="mt-0.5 block text-sm leading-tight text-neutral-600">{countdown}</span>
      </span>
      <span className="text-center">
        <span className="block text-2xl font-semibold leading-none">{event.day}</span>
        <span className="mt-0.5 block text-sm leading-tight">{hebrewMonths[event.month - 1]}</span>
        {event.year != null ? <span className="block text-sm leading-tight">{event.year}</span> : null}
      </span>
      <span className="text-center">
        {years ? (
          <>
            {years.upcoming ? <span className="block text-xs leading-none text-neutral-600">יהיה</span> : null}
            <span className="block text-4xl font-semibold leading-none">{years.years}</span>
          </>
        ) : null}
      </span>
    </button>
  );
}

function EventDialog({
  event,
  src,
  contact,
  onContact,
  onClose,
  onSave,
  onDelete,
}: {
  event: AccountEvent | null;
  src: string | null;
  contact: PickedContact | null;
  onContact: (name: string, image: File | null) => void;
  onClose: () => void;
  onSave: (draft: EventDraft, imageFile: File | null, removeImage: boolean) => Promise<boolean>;
  onDelete: (() => Promise<void>) | null;
}) {
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "birthday");
  const [name, setName] = useState(event?.name ?? contact?.name ?? "");
  const [label, setLabel] = useState(event?.kind === "other" ? event.label : "");
  const [day, setDay] = useState(event ? String(event.day) : "");
  const [month, setMonth] = useState(event?.month ?? new Date().getMonth() + 1);
  const [year, setYear] = useState(event?.year != null ? String(event.year) : "");
  const [comments, setComments] = useState(event?.comments ?? "");
  const [imageFile, setImageFile] = useState<File | null>(contact?.image ?? null);
  const appliedContact = useRef(0);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [canPickContact, setCanPickContact] = useState(false);
  const preview = fileUrl || (!removed ? src : null);

  useEffect(() => {
    if (event) return;
    prepareAndroidContacts();
    setCanPickContact(Boolean(androidContactPicker()));
  }, [event]);

  useLayoutEffect(() => {
    if (!contact || contact.token === appliedContact.current) return;
    appliedContact.current = contact.token;
    if (contact.name) setName(contact.name);
    if (contact.image) {
      setImageFile(contact.image);
      setRemoved(false);
    }
  }, [contact]);

  useEffect(() => {
    if (!imageFile) {
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    function onKey(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  function chooseFile(file: File) {
    setImageFile(file);
    setRemoved(false);
    setConfirmDelete(false);
  }

  async function pickContact() {
    try {
      const picked = await pickAndroidContact();
      if (!picked) return;
      if (!picked.name && !picked.image) {
        setError("לא התקבל שם או תמונה מהאיש קשר");
        return;
      }
      setError(null);
      flushSync(() => onContact(picked.name, picked.image));
    } catch (pickError) {
      if (pickError instanceof DOMException && pickError.name === "AbortError") return;
      setError("לא ניתן לבחור איש קשר");
    }
  }

  async function save() {
    const parsedDay = /^\d{1,2}$/.test(day.trim()) ? Number(day.trim()) : Number.NaN;
    const parsedYear = year.trim() ? (/^\d{1,4}$/.test(year.trim()) ? Number(year.trim()) : Number.NaN) : null;
    const draft: EventDraft = {
      kind,
      name,
      label,
      month,
      day: parsedDay,
      year: parsedYear,
      comments,
    };
    const message = eventDraftError(draft);
    if (message) {
      setError(message);
      return;
    }
    setPending(true);
    setError(null);
    const saved = await onSave(draft, imageFile, removed);
    if (!saved) setPending(false);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={event ? "עריכת אירוע" : "הוספת אירוע"}>
      <form
        className="w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4 text-start"
        style={{ maxHeight: "calc(100dvh - 2rem)" }}
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          if (!pending) void save();
        }}
      >
        <p className="text-sm font-semibold">{event ? "עריכת אירוע" : "הוספת אירוע"}</p>
        <label className="mt-3 block text-sm">
          סוג
          <select
            value={kind}
            onChange={(change) => setKind(change.target.value as EventKind)}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white py-3 ps-3"
            aria-label="סוג"
          >
            {eventKinds.map((entry) => (
              <option key={entry} value={entry}>
                {entry === "other" ? "אחר" : eventTypeLabel({ kind: entry, label: "" })}
              </option>
            ))}
          </select>
        </label>
        {kind === "other" ? (
          <Field label="טקסט האירוע" value={label} maxLength={80} onChange={setLabel} />
        ) : null}
        <div className="mt-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="שם" value={name} maxLength={80} className="" onChange={setName} />
          </div>
          {!event && canPickContact ? (
            <button
              type="button"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-900"
              aria-label="בחירה מאנשי הקשר"
              disabled={pending}
              onClick={() => void pickContact()}
            >
              <UserIcon className="size-6" />
            </button>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Field label="יום" value={day} maxLength={2} inputMode="numeric" className="" onChange={setDay} />
          <label className="block text-sm">
            חודש
            <select
              value={month}
              onChange={(change) => setMonth(Number(change.target.value))}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white py-3 ps-3"
              aria-label="חודש"
            >
              {hebrewMonths.map((monthName, index) => (
                <option key={monthName} value={index + 1}>
                  {monthName}
                </option>
              ))}
            </select>
          </label>
          <Field label="שנה" value={year} maxLength={4} inputMode="numeric" className="" placeholder="רשות" onChange={setYear} />
        </div>
        <div className="mt-3">
          <p className="text-sm">תמונה</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-400">
              {preview ? <img src={preview} alt="" className="absolute inset-0 size-full object-cover" /> : <ImageIcon className="size-7" />}
            </span>
            <ImagePicker
              hasImage={Boolean(preview)}
              variant="light"
              link
              onFile={chooseFile}
              onRemove={
                preview
                  ? () => {
                      setImageFile(null);
                      setRemoved(true);
                    }
                  : undefined
              }
            />
          </div>
        </div>
        <label className="mt-3 block text-sm">
          הערה
          <textarea
            value={comments}
            maxLength={1000}
            onChange={(change) => setComments(change.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:border-[var(--teal)]"
            style={{ minHeight: "4.5rem" }}
            aria-label="הערה"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <button type="submit" disabled={pending} className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40">
          שמירה
        </button>
        {onDelete ? (
          <button
            type="button"
            disabled={pending}
            className="mt-2 w-full rounded-xl border border-red-200 bg-red-50 py-3 font-medium text-red-700 disabled:opacity-40"
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              setPending(true);
              void onDelete();
            }}
          >
            {confirmDelete ? "אישור מחיקה" : "מחיקה"}
          </button>
        ) : null}
        <button type="button" disabled={pending} className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700 disabled:opacity-40" onClick={onClose}>
          ביטול
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  maxLength,
  inputMode,
  className = "mt-3",
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  inputMode?: "numeric" | "text";
  className?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      {label}
      <input
        value={value}
        maxLength={maxLength}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(change) => onChange(change.target.value)}
        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:border-[var(--teal)]"
        aria-label={label}
      />
    </label>
  );
}
