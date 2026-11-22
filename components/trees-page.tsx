"use client";

/** Family trees: a named list, GEDCOM import, and the chart for the open tree. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { CloseIcon, CopyIcon, DotsIcon, DownloadIcon, PenIcon } from "@/components/icons";
import { useLists } from "@/components/lists-provider";
import { TreeEditor } from "@/components/tree-editor";
import {
  addFamilyChild,
  addFamilyParents,
  addFamilyPerson,
  addFamilySpouse,
  createFamilyTree,
  deleteFamilyPeople,
  deleteFamilyTree,
  duplicateFamilyTree,
  exportFamilyGedcom,
  importGedcomFile,
  linkFamilyPeople,
  loadFamilyGraph,
  loadFamilyLinks,
  loadFamilyPeopleBrief,
  loadFamilyTrees,
  renameFamilyTree,
  saveFamilyPerson,
  setFamilyPersonImage,
  setFamilyUnionStatus,
  unlinkFamilyPerson,
  type FamilyGraph,
  type FamilyLink,
  type FamilyTree,
} from "@/lib/family-trees";
import { pushAppHistory, replaceAppHistory } from "@/lib/history";
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
  const [graph, setGraph] = useState<FamilyGraph | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<NamePrompt | null>(null);
  const [confirm, setConfirm] = useState<ConfirmPrompt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [links, setLinks] = useState<Record<string, FamilyLink[]>>({});
  const [focus, setFocus] = useState<{ personId: string; token: number } | null>(null);
  const [treeDepth, setTreeDepth] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const indexScroll = useRef(0);
  const tree = trees.find((row) => row.id === treeId) ?? null;
  const loadPersonImage = useCallback(async (path: string) => {
    const { data, error: downloadError } = await supabase.storage.from("item-images").download(path);
    if (downloadError || !data) return null;
    return data;
  }, [supabase]);

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
      setGraph(null);
      return;
    }
    let cancel = false;
    setGraph(null);
    loadFamilyGraph(supabase, treeId)
      .then((next) => {
        if (!cancel) setGraph(next);
      })
      .catch((reason) => {
        if (!cancel) setError(message(reason));
      });
    return () => {
      cancel = true;
    };
  }, [supabase, treeId]);

  useEffect(() => {
    if (!accountId || !graph) {
      setLinks({});
      return;
    }
    let cancel = false;
    loadFamilyLinks(supabase, accountId, graph.people)
      .then((next) => {
        if (!cancel) setLinks(next);
      })
      .catch(() => {
        if (!cancel) setLinks({});
      });
    return () => {
      cancel = true;
    };
  }, [accountId, graph, supabase]);

  useEffect(() => {
    if (!active) setMenuId(null);
  }, [active]);

  useEffect(() => {
    if (!treeId || !ready) return;
    if (!trees.some((row) => row.id === treeId)) setTreeId(null);
  }, [ready, treeId, trees]);

  function openTree(id: string) {
    setError("");
    setMenuId(null);
    setFocus(null);
    setTreeDepth(0);
    indexScroll.current = window.scrollY;
    replaceAppHistory("/trees", { cnaanTree: { treeId: null } });
    pushAppHistory("/trees", { cnaanTree: { treeId: id, depth: 0 } });
    setTreeId(id);
  }

  function openLinked(nextTreeId: string, personId: string) {
    setError("");
    setFocus({ personId, token: Date.now() });
    if (nextTreeId === treeId) return;
    const depth = (readTreeHistory(window.history.state)?.depth ?? 0) + 1;
    pushAppHistory("/trees", { cnaanTree: { treeId: nextTreeId, depth } });
    setTreeDepth(depth);
    setTreeId(nextTreeId);
  }

  const loadTreePeople = useCallback((id: string) => loadFamilyPeopleBrief(supabase, id), [supabase]);

  function back() {
    if (readTreeHistory(window.history.state)?.treeId) {
      window.history.back();
      return;
    }
    setTreeId(null);
  }

  function home() {
    const depth = readTreeHistory(window.history.state)?.depth ?? treeDepth;
    if (depth > 0) {
      window.history.go(-(depth + 1));
      return;
    }
    setTreeId(null);
    setTreeDepth(0);
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
        actionsEnabled={ready && !busy && importing === null}
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
      />
      <input
        ref={fileRef}
        type="file"
        accept=".ged,application/x-gedcom,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError("");
          setImporting(0);
          void importGedcomFile(supabase, accountId, file, setImporting)
            .then((created) => {
              setTrees((current) => [...current, created].sort((a, b) => a.sort_order - b.sort_order));
              openTree(created.id);
            })
            .catch((reason) => setError(message(reason)))
            .finally(() => setImporting(null));
        }}
      />
      {importing !== null ? <p className="px-4 py-3 text-center text-neutral-500">{`מייבא… ${Math.round(importing * 100)}%`}</p> : null}
      {duplicating ? <p className="px-4 py-3 text-center text-neutral-500">משכפל…</p> : null}
      {!ready ? <p className="px-4 py-8 text-center text-neutral-500">טוען…</p> : null}
      {ready && trees.length === 0 && importing === null ? <p className="px-4 py-8 text-center text-neutral-500">אין עצי משפחה</p> : null}
      <div className="px-3 pb-4 pt-3">
        {trees.map((row) => (
          <div key={row.id} dir="rtl" className={`relative mb-2 flex items-center gap-1 rounded-lg bg-white py-2 pe-1 ps-3 shadow-sm ${menuId === row.id ? "z-30" : ""}`}>
            <button type="button" className="min-w-0 flex-1 truncate text-start text-base" onClick={() => openTree(row.id)}>
              {row.name}
            </button>
            <div className="relative">
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
            </div>
          </div>
        ))}
      </div>
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
        <TreeEditor
          name={tree.name}
          graph={graph}
          error={error}
          busy={busy || importing !== null}
          onBack={back}
          showHome={treeDepth > 0}
          onHome={home}
          onCreatePerson={async () => {
            const person = await run(() => addFamilyPerson(supabase, accountId, tree.id));
            if (!person) return null;
            setGraph((current) => (current ? { ...current, people: [...current.people, person] } : { people: [person], unions: [], children: [] }));
            return person.id;
          }}
          onSavePerson={async (personId, draft) => {
            const saved = await run(() => saveFamilyPerson(supabase, personId, draft));
            if (!saved) return false;
            setGraph((current) =>
              current
                ? { ...current, people: current.people.map((person) => (person.id === personId ? { ...person, ...saved } : person)) }
                : current,
            );
            return true;
          }}
          onAddSpouse={async (personId, input) => {
            const result = await run(() => addFamilySpouse(supabase, accountId, tree.id, personId, input));
            if (!result) return null;
            setGraph((current) => {
              if (!current) return current;
              const people = result.created
                ? [...current.people, result.person]
                : current.people.map((person) =>
                    person.id === result.person.id
                      ? { ...person, ...result.person, image_path: result.person.image_path ?? person.image_path, deceased: person.deceased || result.person.deceased }
                      : person,
                  );
              const unions = current.unions.some((union) => union.id === result.union.id)
                ? current.unions.map((union) => (union.id === result.union.id ? result.union : union))
                : [...current.unions, result.union];
              return { ...current, people, unions };
            });
            return result.person.id;
          }}
          onSetUnionStatus={async (unionId, status) => {
            const saved = await run(() => setFamilyUnionStatus(supabase, unionId, status));
            if (!saved) return;
            setGraph((current) =>
              current ? { ...current, unions: current.unions.map((union) => (union.id === unionId ? { ...union, status: saved } : union)) } : current,
            );
          }}
          onAddChild={async (personId) => {
            const result = await run(() => addFamilyChild(supabase, accountId, tree.id, personId));
            if (!result) return null;
            setGraph((current) => {
              if (!current) return current;
              return {
                ...current,
                people: [...current.people, result.person],
                unions: result.union ? [...current.unions, result.union] : current.unions,
                children: [...current.children, result.link],
              };
            });
            return result.person.id;
          }}
          onAddParents={async (personId) => {
            const result = await run(() => addFamilyParents(supabase, accountId, tree.id, personId));
            if (!result) return null;
            setGraph((current) =>
              current
                ? {
                    ...current,
                    people: [...current.people, ...result.parents],
                    unions: [...current.unions, result.union],
                    children: [...current.children, result.link],
                  }
                : current,
            );
            return result.parents[0]?.id ?? null;
          }}
          onLoadImage={loadPersonImage}
          links={links}
          trees={trees}
          focusPersonId={focus?.personId ?? null}
          focusToken={focus?.token ?? 0}
          onOpenLink={openLinked}
          onLoadTreePeople={loadTreePeople}
          onLinkPerson={async (personId, otherId) => {
            const linkId = await run(() => linkFamilyPeople(supabase, accountId, personId, otherId));
            if (!linkId) return;
            setGraph((current) => (current ? { ...current, people: current.people.map((person) => (person.id === personId ? { ...person, link_id: linkId } : person)) } : current));
          }}
          onUnlinkPerson={async (personId) => {
            const removed = await run(async () => {
              await unlinkFamilyPerson(supabase, accountId, personId);
              return true;
            });
            if (!removed) return;
            setGraph((current) => (current ? { ...current, people: current.people.map((person) => (person.id === personId ? { ...person, link_id: null } : person)) } : current));
          }}
          onPersonImage={async (personId, file) => {
            const person = graph?.people.find((row) => row.id === personId);
            if (!person) return;
            const saved = await run(async () => ({ path: await setFamilyPersonImage(supabase, person, file) }));
            if (!saved) return;
            setGraph((current) =>
              current
                ? { ...current, people: current.people.map((row) => (row.id === personId ? { ...row, image_path: saved.path } : row)) }
                : current,
            );
          }}
          onDeletePerson={async (personId, alsoIds) => {
            const ids = [personId, ...alsoIds.filter((id) => id !== personId)];
            const removed = await run(async () => {
              await deleteFamilyPeople(supabase, ids);
              return true;
            });
            if (!removed) return;
            const removedIds = new Set(ids);
            setGraph((current) => {
              if (!current) return current;
              const unions = current.unions
                .filter((union) => !removedIds.has(union.partner_a))
                .map((union) => (union.partner_b && removedIds.has(union.partner_b) ? { ...union, partner_b: null } : union));
              const unionIds = new Set(unions.map((union) => union.id));
              return {
                people: current.people.filter((person) => !removedIds.has(person.id)),
                unions,
                children: current.children.filter((link) => !removedIds.has(link.person_id) && unionIds.has(link.union_id)),
              };
            });
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
