"use client";

/** Account export and import, opened from the עוד menu on any tab. */

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { useLists } from "@/components/lists-provider";
import { downloadInventoryZip, type ExportSelection } from "@/lib/export-inventory";
import { inspectArchive } from "@/lib/inventory-file";
import { createClient } from "@/lib/supabase/client";

type PendingImport = {
  file: File;
  inventory: boolean;
  grocery: boolean;
  lists: boolean;
  recipes: boolean;
};

type TransferApi = {
  busy: boolean;
  exporting: boolean;
  importing: boolean;
  requestExport: () => void;
  requestImport: () => void;
};

const TransferContext = createContext<TransferApi | null>(null);

export function useDataTransfer() {
  return useContext(TransferContext);
}

export function DataTransfer({ children }: { children: ReactNode }) {
  const lists = useLists();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [confirmExport, setConfirmExport] = useState(false);
  const [exportChoice, setExportChoice] = useState<ExportSelection>({ inventory: true, grocery: true, lists: true, recipes: true });
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const busy = exporting || importing;

  function requestExport() {
    if (busy) return;
    setExportChoice({ inventory: true, grocery: true, lists: true, recipes: true });
    setConfirmExport(true);
  }

  function requestImport() {
    if (busy) return;
    importInputRef.current?.click();
  }

  function beginImport(recipes?: "replace" | "append") {
    if (!pendingImport) return;
    const file = pendingImport.file;
    setPendingImport(null);
    setImportProgress(0);
    setImporting(true);
    setExportError(null);
    void lists
      .importInventory(file, recipes ? { recipes } : undefined, (ratio) => {
        setImportProgress(ratio);
        if (ratio >= 1) setImporting(false);
      })
      .finally(() => setImporting(false));
  }

  return (
    <TransferContext.Provider value={{ busy, exporting, importing, requestExport, requestImport }}>
      {children}
      {exporting ? <WorkOverlay label="מכין את הייצוא…" progress={exportProgress} /> : null}
      {importing ? <WorkOverlay label="מייבא את הנתונים…" progress={importProgress} /> : null}
      <input
        ref={importInputRef}
        type="file"
        accept=".zip,application/zip"
        tabIndex={-1}
        aria-hidden
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (!file) return;
          void file.arrayBuffer().then(async (buffer) => {
            try {
              const flags = await inspectArchive(new Uint8Array(buffer));
              if (!flags.inventory && !flags.grocery && !flags.lists && !flags.recipes) {
                setExportError("הקובץ אינו ייצוא של הרשימה");
                return;
              }
              setPendingImport({ file, ...flags });
            } catch {
              setExportError("הקובץ אינו ייצוא של הרשימה");
            }
          });
        }}
      />
      {exportError ? (
        <p className="fixed left-1/2 top-16 z-[80] -translate-x-1/2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" style={{ width: "min(448px, calc(100% - 2rem))" }}>
          {exportError}
        </p>
      ) : null}
      {pendingImport ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="אישור ייבוא הנתונים"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-start">
            {importNotes(pendingImport).map((note, index) => (
              <p key={note} className="text-sm font-medium" style={{ marginTop: index === 0 ? 0 : "0.5rem" }}>
                {note}
              </p>
            ))}
            {pendingImport.recipes ? (
              <>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white"
                  onClick={() => beginImport("replace")}
                >
                  {pendingImport.inventory || pendingImport.grocery || pendingImport.lists ? "ייבוא והחלפת המתכונים" : "החלפת המתכונים"}
                </button>
                <button
                  type="button"
                  className="mt-2 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white"
                  onClick={() => beginImport("append")}
                >
                  {pendingImport.inventory || pendingImport.grocery || pendingImport.lists ? "ייבוא והוספת המתכונים" : "הוספה למתכונים"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white"
                onClick={() => beginImport()}
              >
                ייבוא
              </button>
            )}
            <button
              type="button"
              className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700"
              onClick={() => setPendingImport(null)}
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {confirmExport ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="בחירת נתונים לייצוא"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-start">
            <p className="text-sm font-semibold">מה לייצא?</p>
            {(
              [
                ["inventory", "רשימת מוצרים"],
                ["grocery", "עגלת קניות"],
                ["lists", "רשימות"],
                ["recipes", "מתכונים"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="mt-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={exportChoice[key]}
                  onChange={(event) => setExportChoice((current) => ({ ...current, [key]: event.target.checked }))}
                />
                <span>{label}</span>
              </label>
            ))}
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40"
              disabled={!exportChoice.inventory && !exportChoice.grocery && !exportChoice.lists && !exportChoice.recipes}
              onClick={() => {
                const selection = exportChoice;
                setConfirmExport(false);
                setExporting(true);
                setExportProgress(0);
                setExportError(null);
                void downloadInventoryZip(
                  createClient(),
                  lists.accountId,
                  lists.categories,
                  lists.items,
                  lists.checklist,
                  lists.stores,
                  lists.grocery,
                  selection,
                  (ratio) => setExportProgress(ratio),
                )
                  .catch(() => setExportError("לא ניתן לייצא את הנתונים"))
                  .finally(() => setExporting(false));
              }}
            >
              ייצוא
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700"
              onClick={() => setConfirmExport(false)}
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}
    </TransferContext.Provider>
  );
}

function importNotes(pending: { inventory: boolean; grocery: boolean; lists: boolean; recipes: boolean }) {
  const notes: string[] = [];
  if (pending.inventory) notes.push("ייבוא יחליף את כל הקטגוריות, המוצרים והתמונות בחשבון זה.");
  if (pending.inventory && !pending.grocery) notes.push("רשימת הקניות תתרוקן.");
  if (pending.grocery) notes.push("עגלת הקניות בקובץ תחליף את העגלה בחשבון.");
  if (pending.lists) notes.push("הרשימות בקובץ יחליפו את הרשימות בחשבון.");
  if (pending.recipes) notes.push("הקובץ כולל מתכונים. להחליף את המתכונים בחשבון, או להוסיף אותם למתכונים הקיימים?");
  return notes;
}

function WorkOverlay({ label, progress }: { label: string; progress: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const percent = progress <= 0 ? 0 : progress >= 1 ? 100 : Math.min(99, Math.max(1, Math.round(progress * 100)));
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      onCancel={(event) => event.preventDefault()}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        maxWidth: "none",
        maxHeight: "none",
        margin: 0,
        padding: 24,
        border: "none",
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          borderRadius: 16,
          background: "#fff",
          textAlign: "center",
          padding: "2rem 1.5rem",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.28)",
        }}
      >
        <style>
          {"@keyframes cnaanlist-spin { to { transform: rotate(360deg); } }"}
        </style>
        <div
          aria-hidden
          style={{
            width: 52,
            height: 52,
            margin: "0 auto 20px",
            borderRadius: "50%",
            border: "4px solid #e5e5e5",
            borderTopColor: "var(--teal)",
            animation: "cnaanlist-spin 0.8s linear infinite",
          }}
        />
        <p className="font-semibold" style={{ fontSize: "1.5rem", lineHeight: 1.35 }}>
          {label}
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={label}
          style={{
            height: 16,
            marginTop: 28,
            overflow: "hidden",
            borderRadius: 999,
            background: "#e5e5e5",
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: "100%",
              borderRadius: 999,
              background: "var(--teal)",
              transition: "width 200ms ease",
            }}
          />
        </div>
        <p className="font-medium" style={{ fontSize: "1.35rem", marginTop: 16, color: "#404040" }}>
          {percent}%
        </p>
      </div>
    </dialog>
  );
}
