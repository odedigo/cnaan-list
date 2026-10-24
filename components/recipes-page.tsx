"use client";

/** Recipes browser, reader, editor, rating, and Hebrew text export. */

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { AppHeader } from "@/components/app-header";
import { ArrowIcon, CameraIcon, CheckIcon, ChevronIcon, CloseIcon, GripIcon, ImageIcon, PenIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { useLists } from "@/components/lists-provider";
import { shrinkImage } from "@/lib/images";
import { nameInsertIndex } from "@/lib/order";
import {
  downloadRecipeFile,
  emptyDocument,
  formatAmount,
  formatHebrewDate,
  ingredientName,
  isSubtitle,
  parseDocument,
  recipeExportText,
  renumberSteps,
  visibleImages,
  type RecipeDocument,
  type RecipeImage,
  type RecipeIngredient,
  type RecipeStep,
} from "@/lib/recipe-document";
import { recipesImportedEvent } from "@/lib/recipe-transfer";
import { createClient } from "@/lib/supabase/client";

type CategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  image_path: string | null;
  sort_order: number;
};

type RecipeRow = {
  id: string;
  title: string;
  leaf_category_id: string;
  source_path: string | null;
  sort_order: number;
  rating: number | null;
  created_at: string;
};

type LabelRow = { recipe_id: string; category_id: string };

type OpenRecipe = {
  id: string;
  title: string;
  leafCategoryId: string;
  sourcePath: string | null;
  rating: number | null;
  createdAt: string;
  document: RecipeDocument;
};

type TabId = "info" | "steps" | "ingredients";

type Checks = { ingredients: number[]; steps: number[] };

const tabs: { id: TabId; label: string }[] = [
  { id: "ingredients", label: "מצרכים" },
  { id: "steps", label: "הכנה" },
  { id: "info", label: "מידע" },
];

export function RecipesPage({ active }: { active: boolean }) {
  const lists = useLists();
  const supabase = useMemo(() => createClient(), []);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [opened, setOpened] = useState(active);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [loading, setLoading] = useState(active);
  if (active && !opened) {
    setOpened(true);
    setLoading(true);
  }
  const [error, setError] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<OpenRecipe | null>(null);
  const [tab, setTab] = useState<TabId>("ingredients");
  const [checks, setChecks] = useState<Checks>({ ingredients: [], steps: [] });
  const [slides, setSlides] = useState<{ id: string; url: string }[]>([]);
  const [slide, setSlide] = useState(0);
  const [creating, setCreating] = useState(false);
  const [imageCategoryId, setImageCategoryId] = useState<string | null>(null);
  const [imageEdit, setImageEdit] = useState<{ id: string | null } | null>(null);
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const [recipeCovers, setRecipeCovers] = useState<Record<string, string>>({});
  const [searchThumbs, setSearchThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [recipeReload, setRecipeReload] = useState(0);

  const byId = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  useEffect(() => {
    if (!opened) return;
    let cancel = false;
    void (async () => {
      setLoading(true);
      const [categoryResult, recipeResult, labelResult] = await Promise.all([
        fetchRows<CategoryRow>((from, to) => supabase.from("recipe_categories").select("id, parent_id, name, image_path, sort_order").eq("account_id", lists.accountId).order("sort_order").range(from, to)),
        fetchRows<RecipeRow>((from, to) => supabase.from("recipes").select("id, title, leaf_category_id, source_path, sort_order, rating, created_at").eq("account_id", lists.accountId).order("sort_order").range(from, to)),
        fetchRows<LabelRow>((from, to) => supabase.from("recipe_labels").select("recipe_id, category_id").range(from, to)),
      ]);
      if (cancel) return;
      const failed = categoryResult.error ?? recipeResult.error ?? labelResult.error;
      if (failed) {
        setError("לא ניתן לטעון מתכונים. יש להריץ את supabase/migrations/0010_recipe_category_image.sql בעורך ה-SQL.");
        setLoading(false);
        return;
      }
      setCategories(categoryResult.data ?? []);
      setRecipes(recipeResult.data ?? []);
      setLabels(labelResult.data ?? []);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [lists.accountId, opened, recipeReload, supabase]);

  useEffect(() => {
    const onImported = () => {
      setOpen(null);
      setRecipeCovers((current) => {
        for (const url of Object.values(current)) URL.revokeObjectURL(url);
        return {};
      });
      setSearchThumbs((current) => {
        for (const url of Object.values(current)) URL.revokeObjectURL(url);
        return {};
      });
      setRecipeReload((value) => value + 1);
    };
    window.addEventListener(recipesImportedEvent, onImported);
    return () => window.removeEventListener(recipesImportedEvent, onImported);
  }, []);

  const openId = open?.id ?? null;
  const shownImages = open ? visibleImages(open.document.images) : [];
  const imageKey = shownImages.map((image) => image.storagePath ?? "").join("|");
  const shownImagesRef = useRef(shownImages);
  shownImagesRef.current = shownImages;

  useEffect(() => {
    if (!openId) return;
    setChecks(readChecks(openId));
    setTab("ingredients");
    setSlide(0);
    setImageEdit(null);
  }, [openId]);

  useEffect(() => {
    if (!openId) {
      setSlides([]);
      return;
    }
    const images = shownImagesRef.current;
    const created: string[] = [];
    let cancel = false;
    void (async () => {
      const next: { id: string; url: string }[] = [];
      for (const image of images) {
        if (!image.storagePath) continue;
        const { data, error: downloadError } = await supabase.storage.from("recipe-images").download(image.storagePath);
        if (cancel || downloadError || !data) continue;
        const url = URL.createObjectURL(data);
        created.push(url);
        next.push({ id: image.id, url });
      }
      if (!cancel) setSlides(next);
    })();
    return () => {
      cancel = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [imageKey, openId, supabase]);

  const categoryImageKey = categories.map((category) => `${category.id}:${category.image_path ?? ""}`).join("|");
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  useEffect(() => {
    const targets = categoriesRef.current.filter((category) => category.image_path);
    const created: string[] = [];
    let cancel = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        targets.map(async (category) => {
          const { data, error: downloadError } = await supabase.storage.from("recipe-images").download(category.image_path as string);
          if (cancel || downloadError || !data) return;
          const url = URL.createObjectURL(data);
          created.push(url);
          next[category.id] = url;
        }),
      );
      if (!cancel) setCategoryImages(next);
    })();
    return () => {
      cancel = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [categoryImageKey, supabase]);

  const folderRecipes = recipes.filter((row) => row.leaf_category_id === folderId).sort((a, b) => a.sort_order - b.sort_order);
  const coverKey = folderRecipes.map((row) => row.id).join("|");
  const coverIdsRef = useRef(folderRecipes);
  coverIdsRef.current = folderRecipes;

  useEffect(() => {
    if (!opened) return;
    const ids = coverIdsRef.current.map((row) => row.id);
    const created: string[] = [];
    let cancel = false;
    if (ids.length === 0) {
      setRecipeCovers({});
      return;
    }
    void (async () => {
      const next: Record<string, string> = {};
      for (let index = 0; index < ids.length; index += 40) {
        const slice = ids.slice(index, index + 40);
        const { data, error: loadError } = await supabase.from("recipes").select("id, images:document->images").in("id", slice);
        if (cancel || loadError || !data) return;
        await Promise.all(
          data.map(async (row) => {
            const record = row as { id: string; images: unknown };
            const storagePath = firstStoragePath(record.images);
            if (!storagePath) return;
            const { data: file, error: downloadError } = await supabase.storage.from("recipe-images").download(storagePath);
            if (cancel || downloadError || !file) return;
            const url = URL.createObjectURL(file);
            created.push(url);
            next[record.id] = url;
          }),
        );
      }
      if (!cancel) setRecipeCovers(next);
    })();
    return () => {
      cancel = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [coverKey, opened, supabase]);

  function depth(id: string) {
    let count = 0;
    let current = byId.get(id);
    while (current?.parent_id) {
      count += 1;
      current = byId.get(current.parent_id);
    }
    return count;
  }

  function chain(id: string) {
    const ids: string[] = [];
    let current = byId.get(id);
    while (current) {
      ids.push(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return ids;
  }

  function labelText(recipeId: string) {
    return labels
      .filter((label) => label.recipe_id === recipeId)
      .map((label) => ({ name: byId.get(label.category_id)?.name ?? "", depth: depth(label.category_id) }))
      .filter((label) => label.name)
      .sort((a, b) => a.depth - b.depth)
      .map((label) => label.name)
      .join(" · ");
  }

  function writeChecks(next: Checks, recipeId = open?.id) {
    setChecks(next);
    if (recipeId) localStorage.setItem(checksKey(recipeId), JSON.stringify(next));
  }

  async function openRecipe(row: RecipeRow) {
    setError(null);
    const { data, error: loadError } = await supabase.from("recipes").select("document").eq("id", row.id).single();
    if (loadError) {
      setError("לא ניתן לפתוח את המתכון.");
      return;
    }
    setOpen({
      id: row.id,
      title: row.title,
      leafCategoryId: row.leaf_category_id,
      sourcePath: row.source_path,
      rating: row.rating,
      createdAt: row.created_at,
      document: parseDocument(data.document, row.title),
    });
  }

  async function saveDocument(recipe: OpenRecipe, document: RecipeDocument, title = recipe.title) {
    const nextDocument = { ...document, title };
    const { error: saveError } = await supabase.from("recipes").update({ title, document: nextDocument }).eq("id", recipe.id);
    if (saveError) throw saveError;
    const next = { ...recipe, title, document: nextDocument };
    setOpen(next);
    setRecipes((current) => current.map((row) => (row.id === recipe.id ? { ...row, title } : row)));
    return next;
  }

  async function rate(value: number) {
    if (!open) return;
    const rating = open.rating === value ? null : value;
    setOpen({ ...open, rating });
    setRecipes((current) => current.map((row) => (row.id === open.id ? { ...row, rating } : row)));
    const { error: saveError } = await supabase.from("recipes").update({ rating }).eq("id", open.id);
    if (saveError) setError("לא ניתן לשמור את הדירוג.");
  }

  async function createRecipe(title: string, leafCategoryId: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const siblings = recipes
        .filter((row) => row.leaf_category_id === leafCategoryId)
        .sort((a, b) => a.sort_order - b.sort_order);
      const index = nameInsertIndex(siblings.map((row) => row.title), trimmed);
      const sortOrder = siblings.length === 0 ? 0 : index === 0 ? siblings[0].sort_order - 1 : siblings[index - 1].sort_order + 1;
      const shifted = siblings.filter((row) => row.sort_order >= sortOrder);
      await Promise.all(shifted.map((row) => supabase.from("recipes").update({ sort_order: row.sort_order + 1 }).eq("id", row.id)));
      const { data, error: insertError } = await supabase
        .from("recipes")
        .insert({
          account_id: lists.accountId,
          title: trimmed,
          leaf_category_id: leafCategoryId,
          document: emptyDocument(trimmed),
          sort_order: sortOrder,
        })
        .select("id, title, leaf_category_id, source_path, sort_order, rating, created_at")
        .single();
      if (insertError || !data) throw insertError ?? new Error("insert failed");
      const labelIds = chain(leafCategoryId);
      if (!labelIds.includes(leafCategoryId)) labelIds.unshift(leafCategoryId);
      const { error: labelError } = await supabase.from("recipe_labels").insert(labelIds.map((categoryId) => ({ recipe_id: data.id, category_id: categoryId })));
      if (labelError) throw labelError;
      const row = data as RecipeRow;
      setRecipes((current) => [...current.map((item) => (shifted.some((row) => row.id === item.id) ? { ...item, sort_order: item.sort_order + 1 } : item)), row]);
      setLabels((current) => [...current, ...labelIds.map((categoryId) => ({ recipe_id: row.id, category_id: categoryId }))]);
      setFolderId(leafCategoryId);
      setCreating(false);
      setOpen({
        id: row.id,
        title: row.title,
        leafCategoryId: row.leaf_category_id,
        sourcePath: row.source_path,
        rating: row.rating,
        createdAt: row.created_at,
        document: emptyDocument(row.title),
      });
    } catch {
      setError("לא ניתן ליצור מתכון.");
    } finally {
      setBusy(false);
    }
  }

  async function createCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
    const siblings = categories.filter((category) => category.parent_id === null);
    const index = nameInsertIndex(siblings.map((category) => category.name), trimmed);
    const { data, error: insertError } = await supabase
      .from("recipe_categories")
      .insert({ account_id: lists.accountId, parent_id: null, name: trimmed, sort_order: index })
      .select("id, parent_id, name, image_path, sort_order")
      .single();
    if (insertError || !data) throw insertError ?? new Error("category failed");
    setCategories((current) => [...current, data as CategoryRow]);
    return (data as CategoryRow).id;
    } catch {
      setError("לא ניתן ליצור קטגוריה.");
      return null;
    }
  }

  async function setCategoryImage(category: CategoryRow, file: File | null) {
    setBusy(true);
    setError(null);
    try {
      if (!file) {
        const { error: updateError } = await supabase.from("recipe_categories").update({ image_path: null }).eq("id", category.id);
        if (updateError) throw updateError;
        if (category.image_path) await supabase.storage.from("recipe-images").remove([category.image_path]);
        setCategories((current) => current.map((row) => (row.id === category.id ? { ...row, image_path: null } : row)));
        return;
      }
      const compressed = await shrinkImage(file, 256, 0.66);
      const extension = compressed.contentType === "image/webp" ? "webp" : "jpg";
      const path = `${lists.accountId}/categories/${category.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("recipe-images").upload(path, compressed.blob, {
        contentType: compressed.contentType,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase.from("recipe_categories").update({ image_path: path }).eq("id", category.id);
      if (updateError) {
        await supabase.storage.from("recipe-images").remove([path]);
        throw updateError;
      }
      if (category.image_path) await supabase.storage.from("recipe-images").remove([category.image_path]);
      setCategories((current) => current.map((row) => (row.id === category.id ? { ...row, image_path: path } : row)));
    } catch {
      setError("לא ניתן לשמור את תמונת הקטגוריה.");
    } finally {
      setBusy(false);
    }
  }

  async function saveIngredients(ingredients: RecipeIngredient[]) {
    if (!open) return false;
    setBusy(true);
    setError(null);
    try {
      await saveDocument(open, { ...open.document, ingredients });
      return true;
    } catch {
      setError("לא ניתן לשמור את המצרכים.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveSteps(steps: RecipeStep[]) {
    if (!open) return false;
    setBusy(true);
    setError(null);
    try {
      await saveDocument(open, { ...open.document, steps });
      return true;
    } catch {
      setError("לא ניתן לשמור את ההכנה.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeRecipeImage(imageId: string | null, file: File | null) {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      const images = [...open.document.images];
      const removed: string[] = [];
      let nextId = imageId;
      if (!file) {
        const current = images.find((image) => image.id === imageId);
        if (current?.storagePath) removed.push(current.storagePath);
        const next = images.filter((image) => image.id !== imageId);
        await saveDocument(open, { ...open.document, images: next });
        if (removed.length > 0) await supabase.storage.from("recipe-images").remove(removed);
        await refreshCover(open.id, visibleImages(next)[0]?.storagePath ?? null);
        setSlide((index) => Math.min(index, Math.max(visibleImages(next).length - 1, 0)));
        setImageEdit(null);
        return;
      }
      const uploaded = await uploadRecipeImage(supabase, lists.accountId, open.id, file);
      const index = imageId ? images.findIndex((image) => image.id === imageId) : -1;
      const current = index >= 0 ? images[index] : undefined;
      if (current?.storagePath) removed.push(current.storagePath);
      const replacement = current?.placement ? { ...uploaded, placement: current.placement } : uploaded;
      const next = index >= 0 ? images.map((image, item) => (item === index ? replacement : image)) : [...images, replacement];
      nextId = replacement.id;
      await saveDocument(open, { ...open.document, images: next });
      if (removed.length > 0) await supabase.storage.from("recipe-images").remove(removed);
      await refreshCover(open.id, visibleImages(next)[0]?.storagePath ?? null);
      setImageEdit({ id: nextId });
    } catch {
      setError("לא ניתן לשמור את התמונה.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshCover(recipeId: string, storagePath: string | null) {
    setRecipeCovers((current) => {
      const previous = current[recipeId];
      if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
      const next = { ...current };
      delete next[recipeId];
      return next;
    });
    if (!storagePath) return;
    const { data, error: downloadError } = await supabase.storage.from("recipe-images").download(storagePath);
    if (downloadError || !data) return;
    const url = URL.createObjectURL(data);
    setRecipeCovers((current) => ({ ...current, [recipeId]: url }));
  }

  async function saveRecipeEdits(draft: EditDraft) {
    if (!open) return false;
    const title = draft.title.trim();
    const selected = draft.categoryIds.filter((id) => byId.has(id));
    if (!title || selected.length === 0) return false;
    setBusy(true);
    setError(null);
    try {
      const notes = draft.notes.map((note) => note.trim()).filter(Boolean);
      const sourceText = draft.sourceText.trim();
      const sourceUrl = draft.sourceUrl.trim();
      const document: RecipeDocument = {
        ...open.document,
        title,
        notes,
        credits: [],
        source: sourceText || sourceUrl ? { text: sourceText, url: sourceUrl || null, linkLabel: open.document.source?.linkLabel ?? null } : null,
      };
      const leaf = chooseLeaf(selected, open.leafCategoryId, depth);
      const saved = await saveDocument(open, document, title);
      const { error: deleteError } = await supabase.from("recipe_labels").delete().eq("recipe_id", open.id);
      if (deleteError) throw deleteError;
      const { error: labelError } = await supabase.from("recipe_labels").insert(selected.map((categoryId) => ({ recipe_id: open.id, category_id: categoryId })));
      if (labelError) throw labelError;
      const { error: leafError } = await supabase.from("recipes").update({ leaf_category_id: leaf }).eq("id", open.id);
      if (leafError) throw leafError;
      setOpen({ ...saved, leafCategoryId: leaf });
      setRecipes((current) => current.map((row) => (row.id === open.id ? { ...row, title, leaf_category_id: leaf } : row)));
      setLabels((current) => [...current.filter((label) => label.recipe_id !== open.id), ...selected.map((categoryId) => ({ recipe_id: open.id, category_id: categoryId }))]);
      return true;
    } catch {
      setError("לא ניתן לשמור את המתכון.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecipe() {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      const paths = open.document.images.map((image) => image.storagePath).filter((path): path is string => Boolean(path));
      const { error: deleteError } = await supabase.from("recipes").delete().eq("id", open.id);
      if (deleteError) throw deleteError;
      if (paths.length > 0) await supabase.storage.from("recipe-images").remove(paths);
      localStorage.removeItem(checksKey(open.id));
      setRecipes((current) => current.filter((row) => row.id !== open.id));
      setLabels((current) => current.filter((label) => label.recipe_id !== open.id));
      setRecipeCovers((current) => {
        const previous = current[open.id];
        if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
        const next = { ...current };
        delete next[open.id];
        return next;
      });
      setImageEdit(null);
      setOpen(null);
    } catch {
      setError("לא ניתן למחוק את המתכון.");
    } finally {
      setBusy(false);
    }
  }

  const needle = query.trim().toLocaleLowerCase("he");
  const searching = searchOpen && needle.length > 0;
  const found = recipes.filter((row) => row.title.toLocaleLowerCase("he").includes(needle)).sort((a, b) => a.title.localeCompare(b.title, "he"));
  const searchKey = searching ? found.map((row) => row.id).join("|") : "";
  const searchIdsRef = useRef(found);
  searchIdsRef.current = found;
  const coversRef = useRef(recipeCovers);
  coversRef.current = recipeCovers;

  useEffect(() => {
    if (!opened || !searchKey) {
      setSearchThumbs({});
      return;
    }
    const ids = searchIdsRef.current.map((row) => row.id).filter((id) => !coversRef.current[id]);
    const created: string[] = [];
    let cancel = false;
    if (ids.length === 0) {
      setSearchThumbs({});
      return;
    }
    void (async () => {
      const next: Record<string, string> = {};
      for (let index = 0; index < ids.length; index += 40) {
        const slice = ids.slice(index, index + 40);
        const { data, error: loadError } = await supabase.from("recipes").select("id, images:document->images").in("id", slice);
        if (cancel || loadError || !data) return;
        await Promise.all(
          data.map(async (row) => {
            const record = row as { id: string; images: unknown };
            const storagePath = firstStoragePath(record.images);
            if (!storagePath) return;
            const { data: file, error: downloadError } = await supabase.storage.from("recipe-images").download(storagePath);
            if (cancel || downloadError || !file) return;
            const url = URL.createObjectURL(file);
            created.push(url);
            next[record.id] = url;
          }),
        );
      }
      if (!cancel) setSearchThumbs(next);
    })();
    return () => {
      cancel = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [opened, searchKey, supabase]);
  const folder = folderId ? byId.get(folderId) : undefined;
  const imageCategory = imageCategoryId ? byId.get(imageCategoryId) : undefined;
  const childCategories = categories.filter((category) => category.parent_id === folderId).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div aria-hidden={!active}>
      <AppHeader
        title="מתכונים"
        actionsEnabled
        searchOpen={searchOpen}
        searchValue={query}
        searchPlaceholder="חיפוש מתכון"
        searchInputRef={searchInputRef}
        searchSide="end"
        plusAfterSearch
        plusLabel="מתכון חדש"
        onSearchToggle={() => {
          setSearchOpen((current) => !current);
          setQuery("");
        }}
        onSearchChange={setQuery}
        onPlus={() => setCreating(true)}
        onExportFile={() => {
          if (!open) return;
          downloadRecipeFile(open.title, recipeExportText({ title: open.title, rating: open.rating, createdAt: open.createdAt, document: open.document }));
        }}
        exportFileEnabled={Boolean(open)}
      />
      {error ? <p className="mx-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="px-6 pt-16 text-center text-neutral-500">טוען מתכונים…</p> : null}
      {!loading && !open && !(error && categories.length === 0) ? (
        <div className="pb-4">
          {searching ? (
            <RecipeList
              rows={found}
              images={{ ...recipeCovers, ...searchThumbs }}
              labelFor={labelText}
              empty="אין מתכונים תואמים."
              onOpen={(row) => void openRecipe(row)}
            />
          ) : (
            <>
              {folder ? (
                <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-start font-semibold" onClick={() => setFolderId(folder.parent_id)}>
                  <BackMark />
                  <span>{folder.name}</span>
                </button>
              ) : null}
              <CategoryTiles
                categories={childCategories}
                images={categoryImages}
                onOpen={setFolderId}
                onImage={setImageCategoryId}
              />
              <RecipeTiles rows={folderRecipes} images={recipeCovers} onOpen={(row) => void openRecipe(row)} />
              {childCategories.length === 0 && folderRecipes.length === 0 ? <p className="px-6 pt-10 text-center text-neutral-500">אין כאן מתכונים.</p> : null}
            </>
          )}
        </div>
      ) : null}
      {!loading && open ? (
        <RecipeDetail
          recipe={open}
          tab={tab}
          slides={slides}
          slide={slide}
          checks={checks}
          categories={categories}
          selected={labels.filter((label) => label.recipe_id === open.id).map((label) => label.category_id)}
          busy={busy}
          depth={depth}
          onTab={(next) => setTab(next)}
          onSlide={setSlide}
          onBack={() => setOpen(null)}
          onRate={(value) => void rate(value)}
          onToggle={(kind, index) => {
            const current = checks[kind];
            const next = current.includes(index) ? current.filter((item) => item !== index) : [...current, index];
            writeChecks({ ...checks, [kind]: next });
          }}
          onClear={(kind) => writeChecks({ ...checks, [kind]: [] })}
          onSaveIngredients={saveIngredients}
          onSaveSteps={saveSteps}
          onSaveInfo={saveRecipeEdits}
          onImage={(id) => setImageEdit({ id })}
          onDelete={deleteRecipe}
        />
      ) : null}
      {creating ? (
        <NewRecipeDialog
          categories={categories}
          folderId={folderId}
          busy={busy}
          depth={depth}
          onClose={() => setCreating(false)}
          onCreate={(title, categoryId) => void createRecipe(title, categoryId)}
          onCreateCategory={createCategory}
        />
      ) : null}
      {imageCategory ? (
        <CategoryImageDialog
          category={imageCategory}
          src={categoryImages[imageCategory.id] ?? null}
          busy={busy}
          onClose={() => setImageCategoryId(null)}
          onFile={(file) => void setCategoryImage(imageCategory, file)}
          onRemove={() => void setCategoryImage(imageCategory, null)}
        />
      ) : null}
      {imageEdit && open ? (
        <RecipeImageDialog
          title={open.title}
          src={imageEdit.id ? (slides.find((item) => item.id === imageEdit.id)?.url ?? null) : null}
          busy={busy}
          onClose={() => setImageEdit(null)}
          onFile={(file) => void changeRecipeImage(imageEdit.id, file)}
          onRemove={imageEdit.id ? () => void changeRecipeImage(imageEdit.id, null) : null}
        />
      ) : null}
    </div>
  );
}

function CategoryTiles({
  categories,
  images,
  onOpen,
  onImage,
}: {
  categories: CategoryRow[];
  images: Record<string, string>;
  onOpen: (id: string) => void;
  onImage: (id: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="grid gap-2 px-3 pt-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
      {categories.map((category) => {
        const src = images[category.id];
        return (
          <div key={category.id} className="relative">
            <button type="button" className="block w-full overflow-hidden rounded-lg border border-neutral-200 bg-white text-start shadow-sm" aria-label={category.name} onClick={() => onOpen(category.id)}>
              <span className="relative block aspect-square overflow-hidden bg-[var(--cream)] text-neutral-400">
                {src ? (
                  <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center">
                    <ImageIcon className="size-5" />
                  </span>
                )}
              </span>
              <span className="block truncate px-1 py-1 text-center text-xs font-medium">{category.name}</span>
            </button>
            <button
              type="button"
              className="absolute grid size-6 place-items-center rounded-full text-neutral-800 shadow-sm"
              style={{ top: "0.2rem", insetInlineEnd: "0.2rem", background: "rgba(255,255,255,0.92)" }}
              aria-label={`תמונה עבור ${category.name}`}
              onClick={() => onImage(category.id)}
            >
              <CameraIcon className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CategoryImageDialog({
  category,
  src,
  busy,
  onClose,
  onFile,
  onRemove,
}: {
  category: CategoryRow;
  src: string | null;
  busy: boolean;
  onClose: () => void;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const drop = useImageDrop((file) => {
    if (!busy) onFile(file);
  });
  return (
    <Overlay label={`תמונה עבור ${category.name}`} onClose={onClose} drop={drop}>
      <h3 className="text-lg font-semibold">{category.name}</h3>
      <div className="relative mt-3 aspect-square overflow-hidden rounded-xl bg-[var(--cream)] text-neutral-400">
        {src ? (
          <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center">
            <ImageIcon className="size-10" />
          </span>
        )}
      </div>
      <p className="mt-2 text-center text-sm text-neutral-500">{drop.over ? "שחררו כדי לבחור את התמונה" : "אפשר לגרור תמונה לכאן"}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button type="button" className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40" disabled={busy} onClick={() => inputRef.current?.click()}>
        בחירת תמונה
      </button>
      {category.image_path ? (
        <button type="button" className="mt-2 w-full rounded-xl py-3 font-medium text-red-600 disabled:opacity-40" disabled={busy} onClick={onRemove}>
          הסרת תמונה
        </button>
      ) : null}
      <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={onClose}>
        סגירה
      </button>
    </Overlay>
  );
}

function RecipeImageDialog({
  title,
  src,
  busy,
  onClose,
  onFile,
  onRemove,
}: {
  title: string;
  src: string | null;
  busy: boolean;
  onClose: () => void;
  onFile: (file: File) => void;
  onRemove: (() => void) | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const drop = useImageDrop((file) => {
    if (!busy) onFile(file);
  });
  return (
    <Overlay label={`תמונה עבור ${title}`} onClose={onClose} drop={drop}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="relative mt-3 aspect-square overflow-hidden rounded-xl bg-[var(--cream)] text-neutral-400">
        {src ? (
          <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center">
            <ImageIcon className="size-10" />
          </span>
        )}
      </div>
      <p className="mt-2 text-center text-sm text-neutral-500">{drop.over ? "שחררו כדי לבחור את התמונה" : "אפשר לגרור תמונה לכאן"}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button type="button" className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40" disabled={busy} onClick={() => inputRef.current?.click()}>
        בחירת תמונה
      </button>
      {onRemove ? (
        <button type="button" className="mt-2 w-full rounded-xl py-3 font-medium text-red-600 disabled:opacity-40" disabled={busy} onClick={onRemove}>
          הסרת תמונה
        </button>
      ) : null}
      <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={onClose}>
        סגירה
      </button>
    </Overlay>
  );
}

function RecipeTiles({
  rows,
  images,
  onOpen,
}: {
  rows: RecipeRow[];
  images: Record<string, string>;
  onOpen: (row: RecipeRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="px-4 pt-4 text-start text-sm font-semibold">מתכונים</h2>
      <div className="grid gap-2 px-3 pt-2" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
      {rows.map((row) => {
        const src = images[row.id];
        return (
          <button
            key={row.id}
            type="button"
            className="block w-full overflow-hidden rounded-lg border text-start shadow-sm"
            style={{ background: "#F2F2F2", borderColor: "#128F86" }}
            aria-label={row.title}
            onClick={() => onOpen(row)}
          >
            <span className="relative block aspect-square overflow-hidden text-neutral-500" style={{ background: "#F2F2F2" }}>
              {src ? (
                <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center">
                  <ImageIcon className="size-5" />
                </span>
              )}
            </span>
            <span className="block truncate px-1 py-1 text-center text-xs font-medium">{row.title}</span>
          </button>
        );
      })}
      </div>
    </section>
  );
}

function firstStoragePath(images: unknown) {
  return visibleImages(parseDocument({ images }).images)[0]?.storagePath ?? null;
}

function RecipeList({
  rows,
  images,
  labelFor,
  empty,
  onOpen,
}: {
  rows: RecipeRow[];
  images: Record<string, string>;
  labelFor: (id: string) => string;
  empty: string;
  onOpen: (row: RecipeRow) => void;
}) {
  if (rows.length === 0) return empty ? <p className="px-6 pt-10 text-center text-neutral-500">{empty}</p> : null;
  return (
    <div>
      {rows.map((row) => {
        const labels = labelFor(row.id);
        const src = images[row.id];
        return (
          <button key={row.id} type="button" className="flex w-full items-center gap-3 border-b border-neutral-200 px-4 py-3 text-start" onClick={() => onOpen(row)}>
            <span className="relative shrink-0 overflow-hidden rounded-lg text-neutral-400" style={{ width: "2.75rem", height: "2.75rem", background: "#F2F2F2" }}>
              {src ? (
                <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center">
                  <ImageIcon className="size-4" />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{row.title}</span>
              {labels ? <span className="mt-1 block truncate text-sm text-neutral-500">{labels}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BackMark() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-black shadow-sm">
      <ArrowIcon className="size-5" />
    </span>
  );
}

function RecipeDetail({
  recipe,
  tab,
  slides,
  slide,
  checks,
  categories,
  selected,
  busy,
  depth,
  onTab,
  onSlide,
  onBack,
  onRate,
  onToggle,
  onClear,
  onSaveIngredients,
  onSaveSteps,
  onSaveInfo,
  onImage,
  onDelete,
}: {
  recipe: OpenRecipe;
  tab: TabId;
  slides: { id: string; url: string }[];
  slide: number;
  checks: Checks;
  categories: CategoryRow[];
  selected: string[];
  busy: boolean;
  depth: (id: string) => number;
  onTab: (tab: TabId) => void;
  onSlide: (index: number) => void;
  onBack: () => void;
  onRate: (value: number) => void;
  onToggle: (kind: "ingredients" | "steps", index: number) => void;
  onClear: (kind: "ingredients" | "steps") => void;
  onSaveIngredients: (ingredients: RecipeIngredient[]) => Promise<boolean>;
  onSaveSteps: (steps: RecipeStep[]) => Promise<boolean>;
  onSaveInfo: (draft: EditDraft) => Promise<boolean>;
  onImage: (id: string | null) => void;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setEditing(false);
    setConfirmDelete(false);
  }, [recipe.id, tab]);
  const source = recipe.document.source;
  const comments = [...recipe.document.credits, ...recipe.document.notes].map((line) => line.trim()).filter(Boolean).join("\n");
  const current = slides[slide];
  return (
    <div>
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-start gap-3">
          <button type="button" className="shrink-0" aria-label="חזרה" onClick={onBack}>
            <BackMark />
          </button>
          <h2 className="min-w-0 text-lg font-semibold leading-8">{recipe.title}</h2>
        </div>
        <div dir="ltr" className="flex shrink-0">
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" aria-label={`דירוג ${value}`} onClick={() => onRate(value)}>
              <StarIcon filled={recipe.rating != null && value <= recipe.rating} />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex bg-[var(--teal)] text-white">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className="flex-1 py-3 text-center font-medium"
            style={{ color: tab === item.id ? "#fff" : "#c4c4c4", boxShadow: tab === item.id ? "inset 0 -3px 0 #fff" : undefined }}
            aria-current={tab === item.id ? "true" : undefined}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "info" ? (
        <div className="pb-4">
          {editing ? (
            <InfoEditor
              recipe={recipe}
              categories={categories}
              selected={selected}
              busy={busy}
              depth={depth}
              onCancel={() => setEditing(false)}
              onSave={async (draft) => {
                if (await onSaveInfo(draft)) setEditing(false);
              }}
            />
          ) : (
            <>
              <TabActions onEdit={() => setEditing(true)} />
              <div className="px-4 py-4">
                <div className="relative" style={{ height: "16rem" }}>
                  {current ? (
                    <img src={current.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    <span className="grid h-full place-items-center text-neutral-400">
                      <ImageIcon className="size-10" />
                    </span>
                  )}
                  {slides.length > 1 ? (
                    <>
                      <ArrowButton label="התמונה הקודמת" side="left" disabled={slide === 0} onClick={() => onSlide(slide - 1)} />
                      <ArrowButton label="התמונה הבאה" side="right" disabled={slide === slides.length - 1} onClick={() => onSlide(slide + 1)} />
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="absolute grid size-6 place-items-center rounded-full text-neutral-800 shadow-sm"
                    style={{ top: "0.2rem", insetInlineEnd: "0.2rem", background: "rgba(255,255,255,0.92)" }}
                    aria-label="תמונה"
                    onClick={() => onImage(current?.id ?? null)}
                  >
                    <CameraIcon className="size-3" />
                  </button>
                </div>
                {source?.url ? (
                  <p className="mt-4 text-start">
                    <a href={source.url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline" }}>
                      {source.text.trim() || source.url}
                    </a>
                  </p>
                ) : source?.text ? (
                  <p className="mt-4 text-start">
                    <span className="font-semibold">מקור: </span>
                    {source.text}
                  </p>
                ) : null}
                <p className="mt-3 text-start">
                  <span className="font-semibold">תאריך הוספה: </span>
                  {formatHebrewDate(recipe.createdAt)}
                </p>
                {recipe.sourcePath ? (
                  <p className="mt-3 text-start">
                    <span className="font-semibold">נתיב מקור: </span>
                    <span style={{ overflowWrap: "anywhere" }}>{recipe.sourcePath.replace(/\.json$/i, "")}</span>
                  </p>
                ) : null}
                {comments ? (
                  <>
                    <p className="mt-4 text-start font-semibold">הערות</p>
                    <p className="text-start" style={{ whiteSpace: "pre-line" }}>{comments}</p>
                  </>
                ) : null}
              </div>
              <div className="px-4">
                <button type="button" className="mt-2 w-full rounded-xl py-3 font-medium text-red-600" onClick={() => setConfirmDelete(true)}>
                  מחיקת מתכון
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
      {tab === "steps" ? (
        editing ? (
          <StepEditor steps={recipe.document.steps} busy={busy} onCancel={() => setEditing(false)} onSave={onSaveSteps} />
        ) : (
          <div>
            <TabActions onEdit={() => setEditing(true)} extra={<ClearMarksButton onClick={() => onClear("steps")} />} />
            {recipe.document.steps.map((step, index) => {
              const itemNumber = recipe.document.steps.filter((item, itemIndex) => !isSubtitle(item.text) && itemIndex <= index).length;
              return isSubtitle(step.text) ? (
                <p key={`${step.number}-${index}`} className="px-4 py-3 text-start font-semibold">
                  {step.text}
                </p>
              ) : (
                <div key={`${step.number}-${index}`} className="flex items-start gap-3 border-b border-neutral-200 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-5 shrink-0"
                    checked={checks.steps.includes(index)}
                    aria-label={`סימון שלב ${itemNumber}`}
                    onChange={() => onToggle("steps", index)}
                  />
                  <p className="min-w-0 flex-1 text-start">
                    <span className="me-2">{itemNumber}.</span>
                    <span>{step.text}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )
      ) : null}
      {tab === "ingredients" ? (
        editing ? (
          <IngredientEditor ingredients={recipe.document.ingredients} busy={busy} onCancel={() => setEditing(false)} onSave={onSaveIngredients} />
        ) : (
          <div>
            <TabActions onEdit={() => setEditing(true)} extra={<ClearMarksButton onClick={() => onClear("ingredients")} />} />
            {recipe.document.ingredients.map((ingredient, index) =>
              isSubtitle(ingredientName(ingredient)) ? (
                <p key={`${ingredient.text}-${index}`} className="px-4 py-3 text-start font-semibold">
                  {ingredientName(ingredient)}
                </p>
              ) : (
                <div key={`${ingredient.text}-${index}`} className="flex items-start gap-3 border-b border-neutral-200 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-5 shrink-0"
                    checked={checks.ingredients.includes(index)}
                    aria-label={`סימון ${ingredientName(ingredient)}`}
                    onChange={() => onToggle("ingredients", index)}
                  />
                  <p className="flex min-w-0 flex-1 items-start justify-between gap-3 text-start">
                    <span className="min-w-0 flex-1">
                      {ingredientName(ingredient)}
                      {ingredient.note ? <span className="block text-sm font-normal text-neutral-600">{ingredient.note}</span> : null}
                    </span>
                    <span className="shrink-0 text-neutral-700">{formatAmount(ingredient.quantity, ingredient.unit)}</span>
                  </p>
                </div>
              ),
            )}
          </div>
        )
      ) : null}
      {confirmDelete ? (
        <Overlay label="מחיקת מתכון" onClose={() => setConfirmDelete(false)}>
          <h3 className="text-start text-lg font-semibold">למחוק את {recipe.title}?</h3>
          <button type="button" className="mt-4 w-full rounded-xl bg-red-50 py-3 font-medium text-red-700 disabled:opacity-40" disabled={busy} onClick={() => void onDelete()}>
            אישור מחיקה
          </button>
          <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={() => setConfirmDelete(false)}>
            ביטול
          </button>
        </Overlay>
      ) : null}
    </div>
  );
}

function TabActions({
  editing = false,
  busy = false,
  onEdit,
  onCancel,
  extra,
}: {
  editing?: boolean;
  busy?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center px-3 pt-2" style={{ justifyContent: "space-between" }}>
      {editing ? (
        <div className="flex items-center gap-1">
          <button type="submit" className="grid size-8 place-items-center disabled:opacity-40" style={{ color: "var(--teal)" }} aria-label="שמירה" disabled={busy}>
            <CheckIcon className="size-5" />
          </button>
          <button type="button" className="grid size-8 place-items-center" aria-label="ביטול" onClick={onCancel}>
            <CloseIcon className="size-5" />
          </button>
        </div>
      ) : (
        <button type="button" className="grid size-8 place-items-center" aria-label="עריכה" onClick={onEdit}>
          <PenIcon className="size-5" />
        </button>
      )}
      {extra ?? <span />}
    </div>
  );
}

function ClearMarksButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="grid size-8 place-items-center text-red-600" aria-label="מחיקת סימונים" onClick={onClick}>
      <TrashIcon className="size-4" />
    </button>
  );
}

function IngredientEditor({
  ingredients,
  busy,
  onCancel,
  onSave,
}: {
  ingredients: RecipeIngredient[];
  busy: boolean;
  onCancel: () => void;
  onSave: (ingredients: RecipeIngredient[]) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<IngredientRow[]>(() =>
    ingredients.map((ingredient) => ({
      key: crypto.randomUUID(),
      heading: isSubtitle(ingredientName(ingredient)),
      name: ingredientName(ingredient),
      quantity: ingredient.quantity ?? "",
      unit: matchRecipeUnit(ingredient.unit ?? ""),
      note: ingredient.note ?? "",
    })),
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || activeId === overId) return;
    setRows((current) => {
      const from = current.findIndex((row) => row.key === activeId);
      const to = current.findIndex((row) => row.key === overId);
      if (from < 0 || to < 0) return current;
      return arrayMove(current, from, to);
    });
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(rowsToIngredients(rows)).then((saved) => {
          if (saved) onCancel();
        });
      }}
    >
      <TabActions editing busy={busy} onCancel={onCancel} />
      <DndContext id="recipe-ingredients" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((row) => row.key)} strategy={verticalListSortingStrategy}>
          {rows.map((row) => {
            const itemNumber = rows.filter((item) => !item.heading && rows.indexOf(item) <= rows.indexOf(row)).length;
            return (
              <SortableStep key={row.key} id={row.key}>
                {row.heading ? (
                  <Field compact label="כותרת" value={row.name.replace(/:$/, "")} onChange={(name) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, name } : item)))} />
                ) : (
                  <>
                    <Field compact label={`מצרך ${itemNumber}`} value={row.name} onChange={(name) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, name } : item)))} />
                    <div className="grid grid-cols-2 gap-2">
                      <Field compact label="כמות" value={row.quantity} onChange={(quantity) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, quantity } : item)))} />
                      <UnitField unit={row.unit} onChange={(unit) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, unit } : item)))} />
                    </div>
                    <Field compact label="הערה" value={row.note} onChange={(note) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, note } : item)))} />
                  </>
                )}
                <DeleteRow onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} />
              </SortableStep>
            );
          })}
        </SortableContext>
      </DndContext>
      <div className="flex items-center justify-start gap-2 px-4 py-3">
        <AddButton label="הוספת מצרך" onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), heading: false, name: "", quantity: "", unit: "יחידה", note: "" }])} />
        <AddButton label="הוספת כותרת" onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), heading: true, name: "", quantity: "", unit: "", note: "" }])} />
      </div>
    </form>
  );
}

function StepEditor({
  steps,
  busy,
  onCancel,
  onSave,
}: {
  steps: RecipeStep[];
  busy: boolean;
  onCancel: () => void;
  onSave: (steps: RecipeStep[]) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<StepRow[]>(() => steps.map((step) => ({ key: crypto.randomUUID(), heading: isSubtitle(step.text), text: step.text })));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || activeId === overId) return;
    setRows((current) => {
      const from = current.findIndex((row) => row.key === activeId);
      const to = current.findIndex((row) => row.key === overId);
      if (from < 0 || to < 0) return current;
      return arrayMove(current, from, to);
    });
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(rowsToSteps(rows)).then((saved) => {
          if (saved) onCancel();
        });
      }}
    >
      <TabActions editing busy={busy} onCancel={onCancel} />
      <DndContext id="recipe-steps" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((row) => row.key)} strategy={verticalListSortingStrategy}>
          {rows.map((row) => {
            const itemNumber = rows.filter((item) => !item.heading && rows.indexOf(item) <= rows.indexOf(row)).length;
            return (
              <SortableStep key={row.key} id={row.key}>
                {row.heading ? (
                  <Field compact label="כותרת" value={row.text.replace(/:$/, "")} onChange={(text) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, text } : item)))} />
                ) : (
                  <label className="block text-start">
                    <span className="mb-1 block text-sm">{`שלב ${itemNumber}`}</span>
                    <textarea className="w-full rounded-xl border border-neutral-300 px-3 py-2" rows={3} value={row.text} onChange={(event) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, text: event.target.value } : item)))} />
                  </label>
                )}
                <DeleteRow onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} />
              </SortableStep>
            );
          })}
        </SortableContext>
      </DndContext>
      <div className="flex items-center justify-start gap-2 px-4 py-3">
        <AddButton label="הוספת שלב" onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), heading: false, text: "" }])} />
        <AddButton label="הוספת כותרת" onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), heading: true, text: "" }])} />
      </div>
    </form>
  );
}

function SortableStep({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="flex items-start gap-2 border-b border-neutral-200 px-3 py-3"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.75 : 1 }}
    >
      <button type="button" className="mt-1 grid size-8 shrink-0 place-items-center text-neutral-500" aria-label="גרירה לשינוי סדר" style={{ touchAction: "none" }} {...attributes} {...listeners}>
        <GripIcon className="size-5" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  const heading = label.includes("כותרת");
  return (
    <button type="button" className="grid h-8 place-items-center rounded border border-neutral-800 px-2" aria-label={label} onClick={onClick}>
      {heading ? <span className="text-sm font-semibold">כותרת</span> : <PlusIcon className="size-4" />}
    </button>
  );
}

function ArrowButton({ label, side, disabled, onClick }: { label: string; side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="absolute grid size-10 place-items-center text-white disabled:opacity-30"
      style={{ [side]: 4, top: "50%", transform: "translateY(-50%)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.6))" }}
      onClick={onClick}
    >
      <ChevronIcon className="size-8" style={{ transform: side === "left" ? "rotate(-90deg)" : "rotate(90deg)" }} />
    </button>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path d="m12 3.2 2.4 5.2 5.6.7-4.1 3.8 1.1 5.6L12 15.8 7 18.5l1.1-5.6L4 9.1l5.6-.7L12 3.2Z" fill={filled ? "#e0a106" : "none"} stroke="#e0a106" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function NewRecipeDialog({
  categories,
  folderId,
  busy,
  depth,
  onClose,
  onCreate,
  onCreateCategory,
}: {
  categories: CategoryRow[];
  folderId: string | null;
  busy: boolean;
  depth: (id: string) => number;
  onClose: () => void;
  onCreate: (title: string, categoryId: string) => void;
  onCreateCategory: (name: string) => Promise<string | null>;
}) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(folderId ?? categories[0]?.id ?? "");
  const [categoryName, setCategoryName] = useState("");
  const ordered = [...categories].sort((a, b) => depth(a.id) - depth(b.id) || a.sort_order - b.sort_order);
  return (
    <Overlay label="מתכון חדש" onClose={onClose}>
      <h3 className="text-lg font-semibold">מתכון חדש</h3>
      <Field label="שם המתכון" value={title} onChange={setTitle} />
      {folderId ? null : categories.length > 0 ? (
        <label className="mt-3 block text-start">
          <span className="mb-1 block text-sm">קטגוריה</span>
          <select className="w-full rounded-xl border border-neutral-300 bg-white ps-3 py-2" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {ordered.map((category) => (
              <option key={category.id} value={category.id}>
                {"— ".repeat(depth(category.id))}
                {category.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <Field label="קטגוריה חדשה" value={categoryName} onChange={setCategoryName} />
      )}
      <button
        type="button"
        className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40"
        disabled={busy || !title.trim() || (!folderId && categories.length > 0 && !categoryId) || (!folderId && categories.length === 0 && !categoryName.trim())}
        onClick={() => {
          void (async () => {
            if (folderId) {
              onCreate(title, folderId);
              return;
            }
            if (categories.length === 0) {
              const created = await onCreateCategory(categoryName);
              if (created) onCreate(title, created);
              return;
            }
            onCreate(title, categoryId);
          })();
        }}
      >
        יצירה
      </button>
      <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={onClose}>
        ביטול
      </button>
    </Overlay>
  );
}

type EditDraft = {
  title: string;
  sourceText: string;
  sourceUrl: string;
  notes: string[];
  categoryIds: string[];
};

type TextRow = { key: string; text: string };
type IngredientRow = { key: string; heading: boolean; name: string; quantity: string; unit: string; note: string };
type StepRow = { key: string; heading: boolean; text: string };

function InfoEditor({
  recipe,
  categories,
  selected,
  busy,
  depth,
  onCancel,
  onSave,
}: {
  recipe: OpenRecipe;
  categories: CategoryRow[];
  selected: string[];
  busy: boolean;
  depth: (id: string) => number;
  onCancel: () => void;
  onSave: (draft: EditDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState(recipe.title);
  const [sourceText, setSourceText] = useState(recipe.document.source?.text ?? "");
  const [sourceUrl, setSourceUrl] = useState(recipe.document.source?.url ?? "");
  const [comments, setComments] = useState(() =>
    [...recipe.document.credits, ...recipe.document.notes]
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n"),
  );
  const [categoryIds, setCategoryIds] = useState(selected);
  const ordered = [...categories].sort((a, b) => depth(a.id) - depth(b.id) || a.sort_order - b.sort_order);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          title,
          sourceText,
          sourceUrl,
          notes: comments.trim() ? [comments.trim()] : [],
          categoryIds,
        });
      }}
    >
      <TabActions editing busy={busy} onCancel={onCancel} />
      <div className="px-4 pb-4">
        <Field label="שם המתכון" value={title} onChange={setTitle} />
        <Field label="מקור" value={sourceText} onChange={setSourceText} />
        <Field label="קישור למקור" value={sourceUrl} onChange={setSourceUrl} />
        <label className="mt-4 block text-start">
          <span className="mb-1 block text-sm font-semibold">הערות</span>
          <textarea className="w-full rounded-xl border border-neutral-300 px-3 py-2" rows={5} value={comments} onChange={(event) => setComments(event.target.value)} />
        </label>
        <p className="mb-1 mt-4 text-start text-sm font-semibold">קטגוריות</p>
        {ordered.map((category) => (
          <label key={category.id} className="flex items-center gap-2 py-1 text-start" style={{ paddingInlineStart: depth(category.id) * 16 }}>
            <input
              type="checkbox"
              className="size-5"
              checked={categoryIds.includes(category.id)}
              onChange={() => setCategoryIds((current) => (current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id]))}
            />
            <span>{category.name}</span>
          </label>
        ))}
      </div>
    </form>
  );
}

function textRows(values: string[]) {
  return values.map((text) => ({ key: crypto.randomUUID(), text }));
}

function filledText(rows: TextRow[]) {
  return rows.map((row) => row.text.trim()).filter(Boolean);
}

function rowsToIngredients(rows: IngredientRow[]): RecipeIngredient[] {
  return rows.flatMap((row): RecipeIngredient[] => {
    const name = row.name.trim().replace(/:$/, "");
    if (!name) return [];
    if (row.heading) {
      const title = `${name}:`;
      return [{ text: title, quantity: null, unit: null, product: title, note: null }];
    }
    const quantity = row.quantity.trim() || null;
    const unit = row.unit.trim() || "יחידה";
    const note = row.note.trim() || null;
    return [{ text: [formatAmount(quantity, unit), name].filter(Boolean).join(" ") || name, quantity, unit, product: name, note }];
  });
}

function rowsToSteps(rows: StepRow[]): RecipeStep[] {
  return renumberSteps(
    rows.flatMap((row) => {
      const text = row.text.trim().replace(/:$/, "");
      if (!text) return [];
      return [{ number: 0, text: row.heading ? `${text}:` : text }];
    }),
  );
}

function TextRows({ label, addLabel, rows, onChange }: { label: string; addLabel: string; rows: TextRow[]; onChange: (rows: TextRow[]) => void }) {
  return (
    <div className="mt-4">
      <p className="text-start text-sm font-semibold">{label}</p>
      {rows.map((row, index) => (
        <div key={row.key} className="mt-2 rounded-xl border border-neutral-200 p-2">
          <Field compact label={`${label} ${index + 1}`} value={row.text} onChange={(text) => onChange(rows.map((item) => (item.key === row.key ? { ...item, text } : item)))} />
          <DeleteRow onClick={() => onChange(rows.filter((item) => item.key !== row.key))} />
        </div>
      ))}
      <AddRow label={addLabel} onClick={() => onChange([...rows, { key: crypto.randomUUID(), text: "" }])} />
    </div>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="mt-2 block text-start text-sm font-medium text-[var(--teal)]" onClick={onClick}>
      {label}
    </button>
  );
}

function DeleteRow({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="mt-2 block text-start text-sm text-red-600" onClick={onClick}>
      מחיקה
    </button>
  );
}

const recipeUnits = ["גרם", 'ק"ג', 'מ"ל', "ליטר", "כוס", "כף", "כפית", "שן", "חבילה", "שקית", "קופסה", "בקבוק", "קורט", "צרור", "יחידה"];

const recipeUnitAliases: Record<string, string> = {
  כפות: "כף",
  כפיות: "כפית",
  כוסות: "כוס",
  קילו: 'ק"ג',
  קג: 'ק"ג',
  'ק״ג': 'ק"ג',
  'מ״ל': 'מ"ל',
  "גר'": "גרם",
  שיני: "שן",
  יחידות: "יחידה",
  קופסאות: "קופסה",
  צרורות: "צרור",
  חבילת: "חבילה",
};

function matchRecipeUnit(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ").replace(/[״“”]/g, '"').replace(/[׳‘’]/g, "'");
  if (!trimmed) return "יחידה";
  const aliased = recipeUnitAliases[trimmed] ?? trimmed;
  return recipeUnits.includes(aliased) ? aliased : trimmed;
}

function UnitField({ unit, onChange }: { unit: string; onChange: (unit: string) => void }) {
  const extra = unit && !recipeUnits.includes(unit) ? unit : "";
  return (
    <label className="mt-2 block text-start">
      <span className="mb-1 block text-sm">יחידה</span>
      <select className="w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3" value={unit || "יחידה"} onChange={(event) => onChange(event.target.value)}>
        {recipeUnits.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {extra ? <option value={extra}>{extra}</option> : null}
      </select>
    </label>
  );
}

function Field({ label, value, onChange, compact = false }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  return (
    <label className={`${compact ? "mt-2" : "mt-3"} block text-start`}>
      <span className="mb-1 block text-sm">{label}</span>
      <input className="w-full rounded-xl border border-neutral-300 px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function useImageDrop(onFile: (file: File) => void) {
  const [over, setOver] = useState(false);
  const handlers = {
    onDragEnter(event: DragEvent<HTMLDivElement>) {
      if (!dragHasFile(event)) return;
      event.preventDefault();
      setOver(true);
    },
    onDragOver(event: DragEvent<HTMLDivElement>) {
      if (!dragHasFile(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setOver(true);
    },
    onDragLeave(event: DragEvent<HTMLDivElement>) {
      if (event.currentTarget.contains(event.relatedTarget as Node)) return;
      setOver(false);
    },
    onDrop(event: DragEvent<HTMLDivElement>) {
      event.preventDefault();
      setOver(false);
      const file = [...event.dataTransfer.files].find(droppedImage);
      if (file) onFile(file);
    },
  };
  return { over, handlers };
}

function dragHasFile(event: DragEvent<HTMLDivElement>) {
  return [...event.dataTransfer.types].includes("Files");
}

function droppedImage(file: File) {
  if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function Overlay({
  label,
  onClose,
  children,
  drop,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  drop?: ReturnType<typeof useImageDrop>;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      {...(drop?.handlers ?? {})}
    >
      <div
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4"
        style={{ maxHeight: "90dvh", boxShadow: drop?.over ? "inset 0 0 0 3px var(--teal)" : undefined }}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

async function fetchRows<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await load(from, from + 999);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: rows, error: null };
  }
}

function chooseLeaf(selected: string[], previous: string, depth: (id: string) => number) {
  return [...selected].sort((a, b) => depth(b) - depth(a) || (a === previous ? -1 : b === previous ? 1 : 0))[0] ?? previous;
}

function checksKey(recipeId: string) {
  return `cnaanlist-recipe-checks:${recipeId}`;
}

function readChecks(recipeId: string): Checks {
  try {
    const raw = JSON.parse(localStorage.getItem(checksKey(recipeId)) ?? "") as Partial<Checks>;
    return {
      ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.filter((index) => typeof index === "number") : [],
      steps: Array.isArray(raw.steps) ? raw.steps.filter((index) => typeof index === "number") : [],
    };
  } catch {
    return { ingredients: [], steps: [] };
  }
}

async function uploadRecipeImage(supabase: ReturnType<typeof createClient>, accountId: string, recipeId: string, file: File): Promise<RecipeImage> {
  const compressed = await shrinkImage(file, 1280, 0.75);
  const id = `image-${crypto.randomUUID()}`;
  const extension = compressed.contentType === "image/webp" ? "webp" : "jpg";
  const storagePath = `${accountId}/${recipeId}/${id}.${extension}`;
  const { error } = await supabase.storage.from("recipe-images").upload(storagePath, compressed.blob, {
    contentType: compressed.contentType,
    upsert: true,
  });
  if (error) throw error;
  return { id, mediaType: compressed.contentType, storagePath, widthPx: compressed.width, heightPx: compressed.height };
}
