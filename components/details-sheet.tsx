"use client";

import { useState, type ReactNode } from "react";

import { CloseIcon, PenIcon } from "@/components/icons";
import { ImageBubble, ImagePicker } from "@/components/images";
import { useLists } from "@/components/lists-provider";
import { formatQuantity, parseQuantity, stepQuantity, UNITS, unitById, type UnitId } from "@/lib/units";

export type Editor =
  | { kind: "category"; id: string }
  | { kind: "new-category" }
  | { kind: "item"; id: string }
  | { kind: "new-item"; categoryId: string };

export function DetailsSheet({
  editor,
  allowRemove,
  onClose,
  onEnlarge,
}: {
  editor: Editor;
  allowRemove: boolean;
  onClose: () => void;
  onEnlarge: (src: string | null, label: string, onReplace: (file: File) => void, onRemove?: () => void) => void;
}) {
  const lists = useLists();
  const category = editor.kind === "category" ? lists.categories.find((entry) => entry.id === editor.id) : null;
  const item = editor.kind === "item" ? lists.items.find((entry) => entry.id === editor.id) : null;
  const [name, setName] = useState(category?.name ?? item?.name ?? "");
  const [categoryId, setCategoryId] = useState(item?.category_id ?? (editor.kind === "new-item" ? editor.categoryId : lists.categories[0]?.id ?? ""));
  const [unit, setUnit] = useState<UnitId>(item?.unit ?? "unit");
  const [quantityText, setQuantityText] = useState(formatQuantity(item?.quantity ?? 1));
  const [editingQuantity, setEditingQuantity] = useState(false);
  const [comments, setComments] = useState(item?.comments ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (editor.kind === "category" && !category) return null;
  if (editor.kind === "item" && !item) return null;

  const savedSrc =
    editor.kind === "category" && category
      ? lists.imageSrc("category", category.id, category.image_path)
      : editor.kind === "item" && item
        ? lists.imageSrc("item", item.id, item.image_path)
        : null;
  const src = preview ?? savedSrc;
  const label = name.trim() || "פריט";

  function chooseFile(file: File) {
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function clearPreview() {
    setImageFile(null);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function removeImage() {
    clearPreview();
    if (category) void lists.removeImage("category", category.id);
    else if (editor.kind === "item") void lists.removeImage("item", editor.id);
  }

  async function save() {
    if (!name.trim()) {
      setFormError("יש להזין שם");
      return;
    }
    setFormError(null);
    if (editor.kind === "new-category") {
      const id = await lists.addCategory(name, imageFile);
      if (id) onClose();
      else setFormError("לא ניתן לשמור");
      return;
    }
    const ok =
      editor.kind === "category" && category
        ? await lists.saveCategory({ id: category.id, name, imageFile })
        : await lists.saveItem({
            id: editor.kind === "item" ? editor.id : undefined,
            categoryId,
            name,
            unit,
            comments,
            quantity: parseQuantity(quantityText),
            imageFile,
          });
    if (ok) onClose();
    else setFormError("לא ניתן לשמור");
  }

  return (
    <div className="fixed inset-x-0 bottom-16 top-0 z-40 mx-auto flex w-full max-w-[480px] flex-col justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="סגירה" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="פרטים" className="relative max-h-[85%] overflow-y-auto rounded-t-2xl bg-white px-4 pt-4 pb-4 shadow-xl">
        {editor.kind === "category" || editor.kind === "new-category" ? (
          <div className="space-y-3">
            <Field value={name} onChange={setName} label="שם הקטגוריה" autoFocus={editor.kind === "new-category"} onClear={() => setName("")} />
            <ImageField
              src={src}
              label={label}
              onChoose={chooseFile}
              onRemove={removeImage}
              onEnlarge={() => {
                onEnlarge(
                  src,
                  label,
                  (file) => {
                    if (category) void lists.uploadImage("category", category.id, file);
                    else chooseFile(file);
                  },
                  removeImage,
                );
              }}
            />
            {editor.kind === "new-category" ? null : confirmDelete ? (
              <button
                type="button"
                className="w-full rounded-xl bg-red-50 py-3 text-red-700"
                onClick={() => {
                  if (category) void lists.deleteCategory(category.id).then(onClose);
                }}
              >
                אישור מחיקה
              </button>
            ) : (
              <button type="button" className="w-full rounded-xl py-3 text-red-600" onClick={() => setConfirmDelete(true)}>
                מחיקת קטגוריה
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Field value={name} onChange={setName} label="שם המוצר" autoFocus={editor.kind === "new-item"} onClear={() => setName("")} />
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded-xl border border-neutral-200 px-2 py-2">
                {editingQuantity ? (
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={quantityText}
                    aria-label="כמות"
                    onChange={(event) => setQuantityText(event.target.value)}
                    onBlur={() => {
                      setQuantityText(formatQuantity(parseQuantity(quantityText)));
                      setEditingQuantity(false);
                    }}
                    className="w-16 bg-transparent outline-none"
                  />
                ) : (
                  <span>
                    {formatQuantity(parseQuantity(quantityText))} {unitById(unit).short}
                  </span>
                )}
                <button type="button" aria-label="עריכת כמות" onClick={() => setEditingQuantity(true)}>
                  <PenIcon className="size-4" />
                </button>
                <div dir="ltr" className="flex items-center gap-1">
                  <RoundButton label="הפחתה" onClick={() => setQuantityText(formatQuantity(stepQuantity(parseQuantity(quantityText), -1)))}>
                    −
                  </RoundButton>
                  <RoundButton label="הוספה" onClick={() => setQuantityText(formatQuantity(stepQuantity(parseQuantity(quantityText), 1)))}>
                    +
                  </RoundButton>
                </div>
              </div>
              <select
                aria-label="יחידה"
                value={unit}
                onChange={(event) => setUnit(event.target.value as UnitId)}
                className="rounded-xl border border-neutral-200 bg-white px-3"
              >
                {UNITS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <select
                aria-label="קטגוריה"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-3"
              >
                {lists.categories.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
              <ImageField
                src={src}
                label={label}
                onChoose={chooseFile}
                onRemove={removeImage}
                onEnlarge={() => {
                  onEnlarge(
                    src,
                    label,
                    (file) => {
                      if (editor.kind === "item") void lists.uploadImage("item", editor.id, file);
                      else chooseFile(file);
                    },
                    removeImage,
                  );
                }}
              />
            </div>
            <Field value={comments} onChange={setComments} label="הערות" onClear={() => setComments("")} />
            {allowRemove && editor.kind === "item" ? (
              <button
                type="button"
                className="w-full rounded-xl py-2 text-sm text-red-600"
                onClick={() => {
                  void lists.removeFromGrocery(editor.id).then(onClose);
                }}
              >
                הסר מרשימת הקניות
              </button>
            ) : null}
          </div>
        )}
        {formError ? <p className="mt-3 text-sm text-red-600">{formError}</p> : null}
        <button type="button" onClick={() => void save()} disabled={lists.saving} className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-60">
          שמירה
        </button>
        <button type="button" onClick={onClose} className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700">
          ביטול
        </button>
      </div>
    </div>
  );
}

function Field({
  value,
  onChange,
  label,
  onClear,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  onClear: () => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
        className="w-full rounded-xl border border-neutral-200 py-3 ps-3 pe-10 outline-none focus:border-[var(--teal)]"
      />
      {value ? (
        <button type="button" className="absolute end-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-neutral-400" aria-label={`ניקוי ${label}`} onClick={onClear}>
          <CloseIcon className="size-4" />
        </button>
      ) : null}
    </label>
  );
}

function ImageField({
  src,
  label,
  onChoose,
  onRemove,
  onEnlarge,
}: {
  src: string | null;
  label: string;
  onChoose: (file: File) => void;
  onRemove?: () => void;
  onEnlarge: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <ImageBubble src={src} label={label} onOpen={onEnlarge} />
      <ImagePicker hasImage={Boolean(src)} variant="light" searchName={label} onFile={onChoose} onRemove={onRemove} />
    </div>
  );
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid size-7 place-items-center rounded-full border border-neutral-300">
      {children}
    </button>
  );
}
