"use client";

/** Family trees: a named list, GEDCOM import, and the chart for the open tree. */

import { useEffect, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { FamilyChartView } from "@/components/family-chart-view";
import { CloseIcon, CopyIcon, DotsIcon, DownloadIcon, PenIcon } from "@/components/icons";
import { useLists } from "@/components/lists-provider";
import {
  createFamilyTree,
  deleteFamilyTree,
  duplicateFamilyTree,
  exportFamilyGedcom,
  importGedcomFile,
  loadFamilyGedcom,
  loadFamilyTrees,
  renameFamilyTree,
  saveFamilyGedcom,
  type FamilyTree,
} from "@/lib/family-trees";
import { pushAppHistory, replaceAppHistory } from "@/lib/history";
import { lockScreenOrientation } from "@/lib/screen-orientation";
import { createClient } from "@/lib/supabase/client";

type NamePrompt = { title: string; initial: string; onSave: (name: string) => void };
type ConfirmPrompt = { title: string; body: string; onConfirm: () => void };

export function TreesPage({ active }: { active: boolean }) {
  const lists = useLists();
  const supabase = useMemo(() => createClient(), []);
  const accountId = lists.accountId;
  const [trees, setTrees] = useState<FamilyTree[]>([]);
  const [ready, setReady] = useState(false);
  const [treeId, setTreeId] = useState<string | null>(null);
  const [gedcom, setGedcom] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<NamePrompt | null>(null);
  const [confirm, setConfirm] = useState<ConfirmPrompt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [, setTreeDepth] = useState(0);
  const [pickingTrees, setPickingTrees] = useState(false);
  const [pickedTrees, setPickedTrees] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const indexScroll = useRef(0);
  const tree = trees.find((row) => row.id === treeId) ?? null;
  const chartBytes = useMemo(() => (gedcom === null ? null : new TextEncoder().encode(gedcom)), [gedcom]);

  useEffect(() => {
    if (!active || !accountId) return;
    let cancel = false;
    loadFamilyTrees(supabase, accountId)
      .then((rows) => {
        if (cancel) return;
        setTrees(rows);
        setReady(true);
      })
      .catch((reason) => {
        if (cancel) return;
        setError(message(reason));
        setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, [accountId, active, supabase]);

  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname !== "/trees") return;
      const entry = readTreeHistory(window.history.state);
      setTreeId(entry?.treeId ?? null);
      setTreeDepth(entry?.depth ?? 0);
      setMenuId(null);
      if (!readTreeHistory(window.history.state)?.treeId) window.scrollTo(0, indexScroll.current);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!treeId) {
      setGedcom(null);
      return;
    }
    let cancel = false;
    setGedcom(null);
    loadFamilyGedcom(supabase, treeId)
      .then((next) => {
        if (!cancel) setGedcom(next);
      })
      .catch((reason) => {
        if (!cancel) setError(message(reason));
      });
    return () => {
      cancel = true;
    };
  }, [supabase, treeId]);

  useEffect(() => {
    if (!active) {
      setMenuId(null);
      setPickingTrees(false);
      setPickedTrees([]);
    }
  }, [active]);

  useEffect(() => {
    if (!treeId || !ready) return;
    if (!trees.some((row) => row.id === treeId)) setTreeId(null);
  }, [ready, treeId, trees]);

  function openTree(id: string) {
    lockScreenOrientation("landscape");
    setError("");
    setMenuId(null);
    setTreeDepth(0);
    indexScroll.current = window.scrollY;
    replaceAppHistory("/trees", { cnaanTree: { treeId: null } });
    pushAppHistory("/trees", { cnaanTree: { treeId: id, depth: 0 } });
    setTreeId(id);
  }

  function back() {
    if (readTreeHistory(window.history.state)?.treeId) {
      window.history.back();
      return;
    }
    setTreeId(null);
  }

  async function run<T>(action: () => Promise<T>) {
    setBusy(true);
    setError("");
    try {
      return await action();
    } catch (reason) {
      setError(message(reason));
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-6rem)]">
      {error && !treeId ? <p className="mx-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <AppHeader
        title="עצי משפחה"
        actionsEnabled={ready && !busy && !importing}
        onHeaderPlus={() =>
          setPrompt({
            title: "עץ חדש",
            initial: "",
            onSave: (name) => {
              void run(async () => {
                const created = await createFamilyTree(supabase, accountId, name);
                setTrees((current) => [...current, created].sort((a, b) => a.sort_order - b.sort_order));
                openTree(created.id);
              });
            },
          })
        }
        headerPlusLabel="עץ חדש"
        onImportList={() => fileRef.current?.click()}
        importListLabel="ייבוא GEDCOM"
        onDeleteMultiple={
          trees.length > 0
            ? () => {
                setMenuId(null);
                setPickedTrees([]);
                setPickingTrees(true);
              }
            : undefined
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".ged,application/x-gedcom,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || !accountId) return;
          setError("");
          setImporting(true);
          void importGedcomFile(supabase, accountId, file)
            .then((created) => {
              setTrees((current) => [...current, created].sort((a, b) => a.sort_order - b.sort_order));
            })
            .catch((reason) => setError(message(reason)))
            .finally(() => setImporting(false));
        }}
      />
      {importing ? <p className="px-4 py-3 text-center text-neutral-500">מייבא…</p> : null}
      {duplicating ? <p className="px-4 py-3 text-center text-neutral-500">משכפל…</p> : null}
      {!ready ? <p className="px-4 py-8 text-center text-neutral-500">טוען…</p> : null}
      {ready && trees.length === 0 && !importing ? <p className="px-4 py-8 text-center text-neutral-500">אין עצי משפחה</p> : null}
      <div className={`px-3 pt-3 ${pickingTrees ? "pb-28" : "pb-4"}`}>
        {trees.map((row) => (
          <div key={row.id} dir="rtl" className={`relative mb-2 flex items-center gap-1 rounded-lg bg-white py-2 pe-1 ps-3 shadow-sm ${menuId === row.id ? "z-30" : ""}`}>
            {pickingTrees ? (
              <label className="flex min-w-0 flex-1 items-center gap-3 py-1 text-start">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--teal)]"
                  checked={pickedTrees.includes(row.id)}
                  onChange={() => setPickedTrees((current) => (current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]))}
                />
                <span className="min-w-0 flex-1 truncate text-base">{row.name}</span>
              </label>
            ) : (
            <button type="button" className="min-w-0 flex-1 truncate text-start text-base" onClick={() => openTree(row.id)}>
              {row.name}
            </button>
            )}
            {pickingTrees ? null : <div className="relative">
              <button
                type="button"
                className="grid size-8 place-items-center text-neutral-500"
                aria-label="פעולות העץ"
                aria-expanded={menuId === row.id}
                onClick={() => setMenuId(menuId === row.id ? null : row.id)}
              >
                <DotsIcon className="size-4" />
              </button>
              {menuId === row.id ? (
                <div role="menu" className="absolute end-0 top-9 z-30 w-max min-w-48 rounded-xl bg-white py-1 text-start shadow-lg">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm"
                    onClick={() => {
                      setMenuId(null);
                      setPrompt({
                        title: "שינוי שם העץ",
                        initial: row.name,
                        onSave: (name) => {
                          void run(async () => {
                            const next = await renameFamilyTree(supabase, row.id, name);
                            setTrees((current) => current.map((item) => (item.id === row.id ? { ...item, name: next } : item)));
                          });
                        },
                      });
                    }}
                  >
                    <PenIcon className="size-5" />
                    שינוי שם העץ
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm"
                    onClick={() => {
                      setMenuId(null);
                      setDuplicating(true);
                      void run(async () => {
                        const created = await duplicateFamilyTree(supabase, row);
                        setTrees((current) => [...current, created].sort((a, b) => a.sort_order - b.sort_order));
                      }).finally(() => setDuplicating(false));
                    }}
                  >
                    <CopyIcon className="size-5" />
                    שכפול העץ
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm"
                    onClick={() => {
                      setMenuId(null);
                      void run(async () => {
                        const file = await exportFamilyGedcom(supabase, row);
                        const blob = new Blob([file.text], { type: "text/plain;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = file.name;
                        link.click();
                        URL.revokeObjectURL(url);
                        return true;
                      });
                    }}
                  >
                    <DownloadIcon className="size-5" />
                    ייצוא GEDCOM
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm"
                    onClick={() => {
                      setMenuId(null);
                      setConfirm({
                        title: "מחיקת עץ",
                        body: `למחוק את "${row.name}"?`,
                        onConfirm: () => {
                          void run(async () => {
                            await deleteFamilyTree(supabase, row.id);
                            setTrees((current) => current.filter((item) => item.id !== row.id));
                          });
                        },
                      });
                    }}
                  >
                    <CloseIcon className="size-5" />
                    מחיקת עץ
                  </button>
                </div>
              ) : null}
            </div>}
          </div>
        ))}
      </div>
      {pickingTrees ? (
        <div className="fixed inset-x-0 z-40 mx-auto flex w-full max-w-[480px] gap-2 px-3" style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}>
          <button
            type="button"
            className="flex-1 rounded-xl bg-white py-3 font-medium text-neutral-700 shadow-lg"
            onClick={() => {
              setPickingTrees(false);
              setPickedTrees([]);
            }}
          >
            ביטול
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl bg-red-600 py-3 font-medium text-white shadow-lg disabled:bg-neutral-300"
            disabled={pickedTrees.length === 0 || busy}
            onClick={() => {
              const ids = pickedTrees;
              const count = ids.length;
              setConfirm({
                title: "מחיקת עצים",
                body: count === 1 ? "למחוק עץ אחד?" : `למחוק ${count} עצים?`,
                onConfirm: () => {
                  void run(async () => {
                    const removed: string[] = [];
                    try {
                      for (const id of ids) {
                        await deleteFamilyTree(supabase, id);
                        removed.push(id);
                      }
                    } finally {
                      if (removed.length > 0) setTrees((current) => current.filter((item) => !removed.includes(item.id)));
                      setPickedTrees((current) => current.filter((id) => !removed.includes(id)));
                      if (removed.length === ids.length) setPickingTrees(false);
                    }
                  });
                },
              });
            }}
          >
            מחיקה
          </button>
        </div>
      ) : null}
      {menuId ? <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="סגירת תפריט" onClick={() => setMenuId(null)} /> : null}
      {prompt ? (
        <NameDialog
          title={prompt.title}
          initial={prompt.initial}
          onClose={() => setPrompt(null)}
          onSave={(name) => {
            setPrompt(null);
            prompt.onSave(name);
          }}
        />
      ) : null}
      {confirm ? (
        <ConfirmDialog
          body={confirm.body}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            confirm.onConfirm();
          }}
        />
      ) : null}
      {active && tree ? (
        <FamilyChartView
          name={tree.name}
          bytes={chartBytes}
          sourceKey={tree.id}
          loading={gedcom === null && !error}
          error={error}
          onBack={back}
          onCommit={async (text) => {
            await saveFamilyGedcom(supabase, tree.id, text);
            setGedcom(text);
          }}
        />
      ) : null}
    </div>
  );
}

function NameDialog({ title, initial, onClose, onSave }: { title: string; initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <form
        className="w-full max-w-xs rounded-2xl bg-white p-4 text-start"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(value);
        }}
      >
        <p className="text-sm font-semibold">{title}</p>
        <input autoFocus value={value} maxLength={80} onChange={(event) => setValue(event.target.value)} className="mt-3 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:border-[var(--teal)]" aria-label={title} />
        <button type="submit" className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white">
          שמירה
        </button>
        <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={onClose}>
          ביטול
        </button>
      </form>
    </div>
  );
}

function ConfirmDialog({ body, onClose, onConfirm }: { body: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="אישור">
      <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-start">
        <p className="text-sm font-medium">{body}</p>
        <button type="button" className="mt-4 w-full rounded-xl bg-red-600 py-3 font-medium text-white" onClick={onConfirm}>
          מחיקה
        </button>
        <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={onClose}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function readTreeHistory(state: unknown) {
  if (!state || typeof state !== "object" || !("cnaanTree" in state)) return null;
  const entry = (state as { cnaanTree?: { treeId?: unknown; depth?: unknown } }).cnaanTree;
  if (!entry || typeof entry !== "object") return null;
  return {
    treeId: typeof entry.treeId === "string" ? entry.treeId : null,
    depth: typeof entry.depth === "number" && entry.depth > 0 ? entry.depth : 0,
  };
}

function message(reason: unknown) {
  return reason instanceof Error && reason.message ? reason.message : "הפעולה נכשלה";
}
