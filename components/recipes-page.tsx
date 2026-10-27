"use client";

/** Recipes browser, reader, editor, rating, and Hebrew text export. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
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
import { ArrowIcon, CameraIcon, CheckIcon, ChevronIcon, ClearMarksIcon, CloseIcon, GripIcon, ImageIcon, MoveAcrossIcon, PenIcon, PlusIcon, StepIcon, SubheaderIcon } from "@/components/icons";
import { useLists } from "@/components/lists-provider";
import { shrinkImage } from "@/lib/images";
import { isAndroidInstalled } from "@/lib/installed-app";
import { nameInsertIndex } from "@/lib/order";
import { readRecipeAdvanced, recipeAdvancedEvent } from "@/lib/recipe-advanced";
import type { CategoryChoice, ImportedRecipe, SharedLink } from "@/lib/recipe-link";
import type { ParsedIngredient, ParsedStep, TokenUsage } from "@/lib/recipe-parse";
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

function ratingSearch(query: string) {
  const match = query.match(/^ד(\d+)(\+)?$/);
  if (!match) return null;
  return { exact: !match[2], value: Number(match[1]) };
}

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
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryMenuId, setCategoryMenuId] = useState<string | null>(null);
  const [categoryDeleteId, setCategoryDeleteId] = useState<string | null>(null);
  const [recipeMenuId, setRecipeMenuId] = useState<string | null>(null);
  const [recipeDeleteId, setRecipeDeleteId] = useState<string | null>(null);
  const [imageCategoryId, setImageCategoryId] = useState<string | null>(null);
  const [imageEdit, setImageEdit] = useState<{ id: string | null } | null>(null);
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const [recipeCovers, setRecipeCovers] = useState<Record<string, string>>({});
  const [searchThumbs, setSearchThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [recipeReload, setRecipeReload] = useState(0);
  const [androidPwa, setAndroidPwa] = useState<boolean | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [sharedLink, setSharedLink] = useState<SharedLink | null>(null);

  const byId = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const directRecipeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of recipes) counts[row.leaf_category_id] = (counts[row.leaf_category_id] ?? 0) + 1;
    return counts;
  }, [recipes]);

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

  useEffect(() => {
    setAndroidPwa(isAndroidInstalled());
  }, []);

  useEffect(() => {
    if (!opened || loading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("share") !== "1") return;
    params.delete("share");
    const next = `${window.location.pathname}${params.size > 0 ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
    let cancel = false;
    void fetch("/api/recipe-share")
      .then((response) => response.json())
      .then((body: SharedLink | null) => {
        if (!cancel && body && (body.url || body.text || body.title)) setSharedLink(body);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [opened, loading]);

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

  async function createCategory(name: string, parentId: string | null = null) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    setBusy(true);
    setError(null);
    try {
      const siblings = categories.filter((category) => category.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);
      const index = nameInsertIndex(siblings.map((category) => category.name), trimmed);
      const sortOrder = siblings.length === 0 ? 0 : index === 0 ? siblings[0].sort_order - 1 : siblings[index - 1].sort_order + 1;
      const shifted = siblings.filter((row) => row.sort_order >= sortOrder);
      if (shifted.length > 0) {
        const updates = await Promise.all(shifted.map((row) => supabase.from("recipe_categories").update({ sort_order: row.sort_order + 1 }).eq("id", row.id)));
        const updateError = updates.find((result) => result.error)?.error;
        if (updateError) throw updateError;
      }
      const { data, error: insertError } = await supabase
        .from("recipe_categories")
        .insert({ account_id: lists.accountId, parent_id: parentId, name: trimmed, sort_order: sortOrder })
        .select("id, parent_id, name, image_path, sort_order")
        .single();
      if (insertError || !data) throw insertError ?? new Error("category failed");
      setCategories((current) => [
        ...current.map((row) => (shifted.some((item) => item.id === row.id) ? { ...row, sort_order: row.sort_order + 1 } : row)),
        data as CategoryRow,
      ]);
      return (data as CategoryRow).id;
    } catch {
      setError("לא ניתן ליצור קטגוריה.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveImported(imported: ImportedRecipe) {
    setBusy(true);
    setError(null);
    try {
      let categoryIds = imported.categoryIds.filter((id) => byId.has(id));
      if (categoryIds.length === 0) {
        const name = imported.newCategory.trim() || "כללי";
        const existing = categories.find((category) => category.name.trim() === name);
        if (existing) categoryIds = [existing.id];
        else {
          const created = await createCategory(name, null);
          if (!created) return;
          categoryIds = [created];
        }
      }
      const leaf = chooseLeaf(categoryIds, categoryIds[0], depth);
      const labelIds = [...new Set([...(chain(leaf).length > 0 ? chain(leaf) : [leaf]), ...categoryIds])];
      const title = imported.title.trim();
      const ingredients = rowsToIngredients(
        imported.ingredients.map((row) => ({
          key: row.name,
          heading: row.heading,
          name: row.name,
          quantity: row.quantity,
          unit: row.heading ? "" : row.unit || "יחידה",
          note: row.note,
        })),
      );
      const steps = rowsToSteps(imported.steps.map((row) => ({ key: row.text, heading: row.heading, text: row.text })));
      const sourceUrl = imported.sourceUrl.trim();
      const sourceText = imported.sourceText.trim();
      const document: RecipeDocument = {
        ...emptyDocument(title),
        title,
        source: sourceText || sourceUrl ? { text: sourceText || sourceUrl, url: sourceUrl || null, linkLabel: null } : null,
        ingredients,
        steps,
        notes: imported.notes.trim() ? [imported.notes.trim()] : [],
      };
      const siblings = recipes.filter((row) => row.leaf_category_id === leaf).sort((a, b) => a.sort_order - b.sort_order);
      const index = nameInsertIndex(siblings.map((row) => row.title), title);
      const sortOrder = siblings.length === 0 ? 0 : index === 0 ? siblings[0].sort_order - 1 : siblings[index - 1].sort_order + 1;
      const shifted = siblings.filter((row) => row.sort_order >= sortOrder);
      await Promise.all(shifted.map((row) => supabase.from("recipes").update({ sort_order: row.sort_order + 1 }).eq("id", row.id)));
      const { data, error: insertError } = await supabase
        .from("recipes")
        .insert({ account_id: lists.accountId, title, leaf_category_id: leaf, document, sort_order: sortOrder })
        .select("id, title, leaf_category_id, source_path, sort_order, rating, created_at")
        .single();
      if (insertError || !data) throw insertError ?? new Error("insert failed");
      const { error: labelError } = await supabase.from("recipe_labels").insert(labelIds.map((categoryId) => ({ recipe_id: data.id, category_id: categoryId })));
      if (labelError) throw labelError;
      const row = data as RecipeRow;
      setRecipes((current) => [...current.map((item) => (shifted.some((shiftedRow) => shiftedRow.id === item.id) ? { ...item, sort_order: item.sort_order + 1 } : item)), row]);
      setLabels((current) => [...current, ...labelIds.map((categoryId) => ({ recipe_id: row.id, category_id: categoryId }))]);
      setSearchOpen(false);
      setQuery("");
      setFolderId(leaf);
      setTab("ingredients");
      setOpen({
        id: row.id,
        title: row.title,
        leafCategoryId: row.leaf_category_id,
        sourcePath: row.source_path,
        rating: row.rating,
        createdAt: row.created_at,
        document,
      });
    } catch {
      setError("לא ניתן לשמור את המתכון.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(category: CategoryRow) {
    setBusy(true);
    setError(null);
    try {
      const ids = [category.id];
      for (let index = 0; index < ids.length; index += 1) {
        for (const row of categories) {
          if (row.parent_id === ids[index]) ids.push(row.id);
        }
      }
      const idSet = new Set(ids);
      const doomed = recipes.filter((row) => idSet.has(row.leaf_category_id));
      const paths = categories.flatMap((row) => (idSet.has(row.id) && row.image_path ? [row.image_path] : []));
      for (let index = 0; index < doomed.length; index += 40) {
        const slice = doomed.slice(index, index + 40).map((row) => row.id);
        const { data, error: loadError } = await supabase.from("recipes").select("id, title, document").in("id", slice);
        if (loadError) throw loadError;
        for (const row of data ?? []) {
          const record = row as { title: string; document: unknown };
          for (const image of parseDocument(record.document, record.title).images) {
            if (image.storagePath) paths.push(image.storagePath);
          }
        }
      }
      const { error: deleteError } = await supabase.from("recipe_categories").delete().eq("id", category.id);
      if (deleteError) throw deleteError;
      for (let index = 0; index < paths.length; index += 100) {
        await supabase.storage.from("recipe-images").remove(paths.slice(index, index + 100));
      }
      for (const row of doomed) localStorage.removeItem(checksKey(row.id));
      const doomedIds = new Set(doomed.map((row) => row.id));
      setCategories((current) => current.filter((row) => !idSet.has(row.id)));
      setRecipes((current) => current.filter((row) => !doomedIds.has(row.id)));
      setLabels((current) => current.filter((label) => !idSet.has(label.category_id) && !doomedIds.has(label.recipe_id)));
      if (folderId && idSet.has(folderId)) setFolderId(category.parent_id);
      setCategoryMenuId(null);
      setCategoryDeleteId(null);
    } catch {
      setError("לא ניתן למחוק את הקטגוריה.");
    } finally {
      setBusy(false);
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

  async function saveIngredients(ingredients: RecipeIngredient[], title: string) {
    if (!open) return false;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("יש להזין שם למתכון.");
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      await saveDocument(open, { ...open.document, ingredients }, nextTitle);
      return true;
    } catch {
      setError("לא ניתן לשמור את המצרכים.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function moveIngredientToSteps(index: number) {
    if (!open) return;
    const text = ingredientMoveText(open.document.ingredients[index]);
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const ingredients = open.document.ingredients.filter((_, itemIndex) => itemIndex !== index);
      const steps = renumberSteps([...open.document.steps, { number: 0, text }]);
      await saveDocument(open, { ...open.document, ingredients, steps });
      writeChecks({ ingredients: shiftChecks(checks.ingredients, index), steps: checks.steps });
    } catch {
      setError("לא ניתן להעביר את המצרך.");
    } finally {
      setBusy(false);
    }
  }

  async function makeIngredientSubtitle(index: number) {
    if (!open) return;
    const ingredient = open.document.ingredients[index];
    const name = ingredient ? ingredientName(ingredient).trim().replace(/:$/, "") : "";
    if (!ingredient || !name || isSubtitle(ingredientName(ingredient))) return;
    const title = `${name}:`;
    setBusy(true);
    setError(null);
    try {
      const ingredients = open.document.ingredients.map((item, itemIndex) => (itemIndex === index ? { text: title, quantity: null, unit: null, product: title, note: null } : item));
      await saveDocument(open, { ...open.document, ingredients });
      writeChecks({ ingredients: checks.ingredients.filter((item) => item !== index), steps: checks.steps });
    } catch {
      setError("לא ניתן להפוך את המצרך לכותרת.");
    } finally {
      setBusy(false);
    }
  }

  async function makeStepSubtitle(index: number) {
    if (!open) return;
    const step = open.document.steps[index];
    const text = step?.text.trim().replace(/:$/, "") ?? "";
    if (!step || !text || isSubtitle(step.text)) return;
    setBusy(true);
    setError(null);
    try {
      const steps = renumberSteps(open.document.steps.map((item, itemIndex) => (itemIndex === index ? { ...item, text: `${text}:` } : item)));
      await saveDocument(open, { ...open.document, steps });
      writeChecks({ ingredients: checks.ingredients, steps: checks.steps.filter((item) => item !== index) });
    } catch {
      setError("לא ניתן להפוך את השלב לכותרת.");
    } finally {
      setBusy(false);
    }
  }

  async function makeStepItem(index: number) {
    if (!open) return;
    const step = open.document.steps[index];
    const text = step?.text.trim().replace(/:$/, "") ?? "";
    if (!step || !text || !isSubtitle(step.text)) return;
    setBusy(true);
    setError(null);
    try {
      const steps = renumberSteps(open.document.steps.map((item, itemIndex) => (itemIndex === index ? { ...item, text } : item)));
      await saveDocument(open, { ...open.document, steps });
    } catch {
      setError("לא ניתן להפוך את הכותרת לשלב.");
    } finally {
      setBusy(false);
    }
  }

  async function moveStepToIngredients(index: number) {
    if (!open) return;
    const ingredient = ingredientFromStep(open.document.steps[index]);
    if (!ingredient) return;
    setBusy(true);
    setError(null);
    try {
      const steps = renumberSteps(open.document.steps.filter((_, itemIndex) => itemIndex !== index));
      const ingredients = [...open.document.ingredients, ingredient];
      await saveDocument(open, { ...open.document, ingredients, steps });
      writeChecks({ ingredients: checks.ingredients, steps: shiftChecks(checks.steps, index) });
    } catch {
      setError("לא ניתן להעביר את השלב.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSteps(steps: RecipeStep[], title: string) {
    if (!open) return false;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("יש להזין שם למתכון.");
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      await saveDocument(open, { ...open.document, steps }, nextTitle);
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

  async function deleteRecipe(recipeId?: string) {
    const id = recipeId ?? open?.id;
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      let paths: string[] = [];
      if (open?.id === id) {
        paths = open.document.images.map((image) => image.storagePath).filter((path): path is string => Boolean(path));
      } else {
        const { data, error: loadError } = await supabase.from("recipes").select("title, document").eq("id", id).single();
        if (loadError) throw loadError;
        const record = data as { title: string; document: unknown };
        paths = parseDocument(record.document, record.title).images.map((image) => image.storagePath).filter((path): path is string => Boolean(path));
      }
      const { error: deleteError } = await supabase.from("recipes").delete().eq("id", id);
      if (deleteError) throw deleteError;
      if (paths.length > 0) await supabase.storage.from("recipe-images").remove(paths);
      localStorage.removeItem(checksKey(id));
      setRecipes((current) => current.filter((row) => row.id !== id));
      setLabels((current) => current.filter((label) => label.recipe_id !== id));
      setRecipeCovers((current) => dropBlob(current, id));
      setSearchThumbs((current) => dropBlob(current, id));
      if (open?.id === id) {
        setImageEdit(null);
        setOpen(null);
      }
      setRecipeMenuId(null);
      setRecipeDeleteId(null);
    } catch {
      setError("לא ניתן למחוק את המתכון.");
    } finally {
      setBusy(false);
    }
  }

  const needle = query.trim().toLocaleLowerCase("he");
  const rating = ratingSearch(needle);
  const searching = searchOpen && needle.length > 0;
  const found = recipes
    .filter((row) => {
      if (rating) return row.rating != null && (rating.exact ? row.rating === rating.value : row.rating >= rating.value);
      return row.title.toLocaleLowerCase("he").includes(needle);
    })
    .sort((a, b) => a.title.localeCompare(b.title, "he"));
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
  const menuCategory = categoryMenuId ? byId.get(categoryMenuId) : undefined;
  const categoryToDelete = categoryDeleteId ? byId.get(categoryDeleteId) : undefined;
  const menuRecipe = recipeMenuId ? recipes.find((row) => row.id === recipeMenuId) : undefined;
  const recipeToDelete = recipeDeleteId ? recipes.find((row) => row.id === recipeDeleteId) : undefined;
  const childCategories = categories.filter((category) => category.parent_id === folderId).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div aria-hidden={!active}>
      <AppHeader
        title="מתכונים"
        actionsEnabled
        searchOpen={searchOpen}
        searchValue={query}
        searchPlaceholder="חיפוש מתכון, ד2 לדירוג 2, ד2+ לדירוג 2 ומעלה"
        searchInputRef={searchInputRef}
        searchSide="start"
        onSearchToggle={() => {
          setSearchOpen((current) => !current);
          setQuery("");
        }}
        onSearchChange={setQuery}
        onLink={!loading && !open && !searching && androidPwa === false ? () => setLinkOpen(true) : undefined}
        onPasteRecipe={!loading && !open && !searching ? () => setTextOpen(true) : undefined}
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
              onMenu={setRecipeMenuId}
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
                counts={directRecipeCounts}
                onOpen={setFolderId}
                onImage={setImageCategoryId}
                onAdd={() => setAddingCategory(true)}
                onMenu={setCategoryMenuId}
              />
              <RecipeTiles
                rows={folderRecipes}
                images={recipeCovers}
                onOpen={(row) => void openRecipe(row)}
                onMenu={setRecipeMenuId}
                onAdd={folderId ? () => setCreating(true) : undefined}
              />
              {!folderId && childCategories.length === 0 && folderRecipes.length === 0 ? <p className="px-6 pt-10 text-center text-neutral-500">אין כאן מתכונים.</p> : null}
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
          onMoveIngredient={(index) => void moveIngredientToSteps(index)}
          onMoveStep={(index) => void moveStepToIngredients(index)}
          onMakeIngredientSubtitle={(index) => void makeIngredientSubtitle(index)}
          onMakeStepSubtitle={(index) => void makeStepSubtitle(index)}
          onMakeStepItem={(index) => void makeStepItem(index)}
          onSaveInfo={saveRecipeEdits}
          onImage={(id) => setImageEdit({ id })}
          onDelete={deleteRecipe}
        />
      ) : null}
      {linkOpen || sharedLink ? (
        <LinkRecipeDialog
          kind="link"
          shared={sharedLink}
          categories={categories.map((category) => ({ id: category.id, name: category.name, parentName: category.parent_id ? (byId.get(category.parent_id)?.name ?? "") : "" }))}
          onClose={() => {
            setLinkOpen(false);
            setSharedLink(null);
          }}
          onDone={(imported) => {
            setLinkOpen(false);
            setSharedLink(null);
            void saveImported(imported);
          }}
        />
      ) : null}
      {textOpen ? (
        <LinkRecipeDialog
          kind="text"
          shared={null}
          categories={categories.map((category) => ({ id: category.id, name: category.name, parentName: category.parent_id ? (byId.get(category.parent_id)?.name ?? "") : "" }))}
          onClose={() => setTextOpen(false)}
          onDone={(imported) => {
            setTextOpen(false);
            void saveImported(imported);
          }}
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
      {addingCategory ? (
        <CategoryNameDialog
          busy={busy}
          onClose={() => setAddingCategory(false)}
          onCreate={(name) => {
            void createCategory(name, folderId).then((id) => {
              if (id) setAddingCategory(false);
            });
          }}
        />
      ) : null}
      {menuCategory ? (
        <Overlay label={`פעולות עבור ${menuCategory.name}`} onClose={() => setCategoryMenuId(null)}>
          <h3 className="text-start text-lg font-semibold">{menuCategory.name}</h3>
          <button
            type="button"
            className="mt-4 w-full rounded-xl py-3 font-medium text-red-600"
            onClick={() => {
              setCategoryDeleteId(menuCategory.id);
              setCategoryMenuId(null);
            }}
          >
            מחיקת קטגוריה
          </button>
          <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={() => setCategoryMenuId(null)}>
            ביטול
          </button>
        </Overlay>
      ) : null}
      {categoryToDelete ? (
        <Overlay label="מחיקת קטגוריה" onClose={() => setCategoryDeleteId(null)}>
          <h3 className="text-start text-lg font-semibold">למחוק את {categoryToDelete.name}?</h3>
          <p className="mt-2 text-start text-sm text-neutral-600">הקטגוריה תימחק יחד עם כל הקטגוריות והמתכונים שבתוכה.</p>
          <button type="button" className="mt-4 w-full rounded-xl bg-red-50 py-3 font-medium text-red-700 disabled:opacity-40" disabled={busy} onClick={() => void removeCategory(categoryToDelete)}>
            אישור מחיקה
          </button>
          <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={() => setCategoryDeleteId(null)}>
            ביטול
          </button>
        </Overlay>
      ) : null}
      {menuRecipe ? (
        <Overlay label={`פעולות עבור ${menuRecipe.title}`} onClose={() => setRecipeMenuId(null)}>
          <h3 className="text-start text-lg font-semibold">{menuRecipe.title}</h3>
          <button
            type="button"
            className="mt-4 w-full rounded-xl py-3 font-medium text-red-600"
            onClick={() => {
              setRecipeDeleteId(menuRecipe.id);
              setRecipeMenuId(null);
            }}
          >
            מחיקת מתכון
          </button>
          <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={() => setRecipeMenuId(null)}>
            ביטול
          </button>
        </Overlay>
      ) : null}
      {recipeToDelete ? (
        <Overlay label="מחיקת מתכון" onClose={() => setRecipeDeleteId(null)}>
          <h3 className="text-start text-lg font-semibold">למחוק את {recipeToDelete.title}?</h3>
          <button type="button" className="mt-4 w-full rounded-xl bg-red-50 py-3 font-medium text-red-700 disabled:opacity-40" disabled={busy} onClick={() => void deleteRecipe(recipeToDelete.id)}>
            אישור מחיקה
          </button>
          <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={() => setRecipeDeleteId(null)}>
            ביטול
          </button>
        </Overlay>
      ) : null}
    </div>
  );
}

function useHoldMenu(onMenu: (id: string) => void) {
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const skipClick = useRef(false);

  function clearHold() {
    if (!hold.current) return;
    window.clearTimeout(hold.current.timer);
    hold.current = null;
  }

  return function menuProps(id: string) {
    return {
      style: { WebkitTouchCallout: "none" as const, userSelect: "none" as const },
      onContextMenu(event: MouseEvent) {
        event.preventDefault();
        onMenu(id);
      },
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.pointerType !== "touch") return;
        clearHold();
        const x = event.clientX;
        const y = event.clientY;
        const timer = window.setTimeout(() => {
          hold.current = null;
          skipClick.current = true;
          onMenu(id);
        }, 500);
        hold.current = { timer, x, y };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const current = hold.current;
        if (!current) return;
        if (Math.abs(event.clientX - current.x) > 12 || Math.abs(event.clientY - current.y) > 12) clearHold();
      },
      onPointerUp: clearHold,
      onPointerCancel: clearHold,
      onClickCapture(event: MouseEvent) {
        if (!skipClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        skipClick.current = false;
      },
    };
  };
}

function dropBlob(images: Record<string, string>, id: string) {
  const previous = images[id];
  if (!previous) return images;
  if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
  const next = { ...images };
  delete next[id];
  return next;
}

function CategoryTiles({
  categories,
  images,
  counts,
  onOpen,
  onImage,
  onAdd,
  onMenu,
}: {
  categories: CategoryRow[];
  images: Record<string, string>;
  counts: Record<string, number>;
  onOpen: (id: string) => void;
  onImage: (id: string) => void;
  onAdd: () => void;
  onMenu: (id: string) => void;
}) {
  const menuProps = useHoldMenu(onMenu);
  return (
    <div className="grid gap-2 px-3 pt-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
      {categories.map((category) => {
        const src = images[category.id];
        const count = counts[category.id] ?? 0;
        return (
          <div key={category.id} className="relative" {...menuProps(category.id)}>
            <button type="button" className="block w-full overflow-hidden rounded-lg border border-neutral-200 bg-white text-start shadow-sm" aria-label={`${category.name}, ${count}`} onClick={() => onOpen(category.id)}>
              <span className="relative block aspect-square overflow-hidden bg-[var(--cream)] text-neutral-400">
                {src ? (
                  <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center">
                    <ImageIcon className="size-5" />
                  </span>
                )}
              </span>
              <span className="flex min-w-0 items-center justify-center gap-1 px-1 py-1">
                <span className="min-w-0 truncate text-xs font-medium">{category.name}</span>
                <span className="shrink-0 rounded-full bg-neutral-200 px-1 text-center text-[10px] font-semibold leading-4 text-neutral-600" style={{ minWidth: "1rem" }}>{count}</span>
              </span>
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
      <button type="button" className="block w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm" aria-label="קטגוריה חדשה" onClick={onAdd}>
        <span className="grid aspect-square bg-[var(--cream)] text-[var(--teal)]" style={{ placeItems: "center" }}>
          <PlusIcon className="size-8" />
        </span>
        <span className="block px-1 py-1 text-xs">&nbsp;</span>
      </button>
    </div>
  );
}

function CategoryNameDialog({ busy, onClose, onCreate }: { busy: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Overlay label="קטגוריה חדשה" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && !busy) onCreate(name);
        }}
      >
        <h3 className="text-lg font-semibold">קטגוריה חדשה</h3>
        <label className="mt-3 block text-start">
          <span className="mb-1 block text-sm">שם הקטגוריה</span>
          <input className="w-full rounded-xl border border-neutral-300 px-3 py-2" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit" className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40" disabled={busy || !name.trim()}>
          יצירה
        </button>
        <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={onClose}>
          ביטול
        </button>
      </form>
    </Overlay>
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
      <CameraShot disabled={busy} onFile={onFile} />
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
      <CameraShot disabled={busy} onFile={onFile} />
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

function cameraDenied(error: unknown) {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
}

async function cameraPermission() {
  if (!navigator.permissions?.query) return "prompt";
  try {
    const status = await navigator.permissions.query({ name: "camera" as PermissionName });
    return status.state;
  } catch {
    return "prompt";
  }
}

function CameraShot({ disabled, onFile }: { disabled: boolean; onFile: (file: File) => void }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function stop() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
    setOpen(false);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!open || !video || !stream) return;
    video.srcObject = stream;
    void video.play();
  }, [open]);

  async function openCamera() {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("המצלמה אינה זמינה בדפדפן זה");
      return;
    }
    if ((await cameraPermission()) === "denied") {
      setError("יש לאשר גישה למצלמה");
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (failure) {
        if (cameraDenied(failure)) throw failure;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setOpen(true);
    } catch (failure) {
      setError(cameraDenied(failure) ? "יש לאשר גישה למצלמה" : "לא ניתן לפתוח את המצלמה");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      stop();
      if (!blob) return;
      onFile(new File([blob], "camera.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  return (
    <>
      <button type="button" className="mt-2 w-full rounded-xl border border-neutral-300 py-3 font-medium disabled:opacity-40" disabled={disabled} onClick={() => void openCamera()}>
        צילום
      </button>
      {error ? <p className="mt-2 text-center text-sm text-red-600">{error}</p> : null}
      {open
        ? createPortal(
            <div className="fixed inset-0 flex flex-col bg-black p-4" style={{ zIndex: 90 }} role="dialog" aria-modal="true" aria-label="מצלמה">
              <video ref={videoRef} autoPlay playsInline muted className="mx-auto my-auto max-h-[70vh] max-w-full rounded-lg" onLoadedMetadata={() => setReady(true)} />
              <div className="mx-auto mt-4 flex items-center gap-3">
                <button type="button" className="grid size-14 place-items-center rounded-full bg-[var(--teal)] text-white disabled:opacity-40" aria-label="צילום" disabled={!ready} onClick={capture}>
                  <CameraIcon className="size-7" />
                </button>
                <button type="button" className="grid size-14 place-items-center rounded-full bg-white text-neutral-700" aria-label="ביטול" onClick={stop}>
                  <CloseIcon className="size-6" />
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function RecipeTiles({
  rows,
  images,
  onOpen,
  onMenu,
  onAdd,
}: {
  rows: RecipeRow[];
  images: Record<string, string>;
  onOpen: (row: RecipeRow) => void;
  onMenu: (id: string) => void;
  onAdd?: () => void;
}) {
  const menuProps = useHoldMenu(onMenu);
  if (rows.length === 0 && !onAdd) return null;
  return (
    <section>
      <h2 className="flex items-center gap-1 px-4 pt-4 text-start text-sm font-semibold">
        <span>מתכונים</span>
        <span className="shrink-0 rounded-full bg-neutral-200 px-1 text-center text-[10px] font-semibold leading-4 text-neutral-600" style={{ minWidth: "1rem" }}>{rows.length}</span>
      </h2>
      <div className="grid gap-2 px-3 pt-2" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
      {rows.map((row) => {
        const src = images[row.id];
        const menu = menuProps(row.id);
        return (
          <button
            key={row.id}
            type="button"
            className="block w-full overflow-hidden rounded-lg border text-start shadow-sm"
            aria-label={row.rating != null ? `${row.title}, דירוג ${row.rating}` : row.title}
            {...menu}
            style={{ background: "#F2F2F2", borderColor: "#128F86", ...menu.style }}
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
              <TileRating rating={row.rating} />
            </span>
            <span className="block truncate px-1 py-1 text-center text-xs font-medium">{row.title}</span>
          </button>
        );
      })}
      {onAdd ? (
        <button type="button" className="block w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm" aria-label="מתכון חדש" onClick={onAdd}>
          <span className="grid aspect-square bg-[var(--cream)] text-[var(--teal)]" style={{ placeItems: "center" }}>
            <PlusIcon className="size-8" />
          </span>
          <span className="block px-1 py-1 text-xs">&nbsp;</span>
        </button>
      ) : null}
      </div>
    </section>
  );
}

function TileRating({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  return (
    <span className="absolute flex items-center font-semibold text-neutral-900" dir="ltr" style={{ top: 4, left: 4, gap: 2, padding: "2px 4px", borderRadius: 6, background: "#fff", fontSize: 13, lineHeight: 1 }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 15, height: 15 }}>
        <path d="m12 3.2 2.4 5.2 5.6.7-4.1 3.8 1.1 5.6L12 15.8 7 18.5l1.1-5.6L4 9.1l5.6-.7L12 3.2Z" fill="#f5b400" />
      </svg>
      {rating}
    </span>
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
  onMenu,
}: {
  rows: RecipeRow[];
  images: Record<string, string>;
  labelFor: (id: string) => string;
  empty: string;
  onOpen: (row: RecipeRow) => void;
  onMenu: (id: string) => void;
}) {
  const menuProps = useHoldMenu(onMenu);
  if (rows.length === 0) return empty ? <p className="px-6 pt-10 text-center text-neutral-500">{empty}</p> : null;
  return (
    <div>
      {rows.map((row) => {
        const labels = labelFor(row.id);
        const src = images[row.id];
        return (
          <button key={row.id} type="button" className="flex w-full items-center gap-3 border-b border-neutral-200 px-4 py-3 text-start" {...menuProps(row.id)} onClick={() => onOpen(row)}>
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
  onMoveIngredient,
  onMoveStep,
  onMakeIngredientSubtitle,
  onMakeStepSubtitle,
  onMakeStepItem,
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
  onSaveIngredients: (ingredients: RecipeIngredient[], title: string) => Promise<boolean>;
  onSaveSteps: (steps: RecipeStep[], title: string) => Promise<boolean>;
  onMoveIngredient: (index: number) => void;
  onMoveStep: (index: number) => void;
  onMakeIngredientSubtitle: (index: number) => void;
  onMakeStepSubtitle: (index: number) => void;
  onMakeStepItem: (index: number) => void;
  onSaveInfo: (draft: EditDraft) => Promise<boolean>;
  onImage: (id: string | null) => void;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(recipe.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    const sync = () => setAdvanced(readRecipeAdvanced());
    sync();
    window.addEventListener(recipeAdvancedEvent, sync);
    return () => window.removeEventListener(recipeAdvancedEvent, sync);
  }, []);
  useEffect(() => {
    setEditing(false);
    setConfirmDelete(false);
    setTitle(recipe.title);
  }, [recipe.id, tab, recipe.title]);
  function startEdit() {
    setTitle(recipe.title);
    setEditing(true);
  }
  const source = recipe.document.source;
  const comments = [...recipe.document.credits, ...recipe.document.notes].map((line) => line.trim()).filter(Boolean).join("\n");
  const current = slides[slide];
  return (
    <div>
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <button type="button" className="shrink-0" aria-label="חזרה" onClick={onBack}>
            <BackMark />
          </button>
          {editing ? (
            <input className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 text-lg font-semibold" style={{ height: "2rem" }} aria-label="שם המתכון" value={title} onChange={(event) => setTitle(event.target.value)} />
          ) : (
            <h2 className="min-w-0 text-lg font-semibold leading-8" style={{ overflowWrap: "anywhere" }}>{recipe.title}</h2>
          )}
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
        {tabs.map((item) => {
          const locked = editing && item.id !== tab;
          return (
            <button
              key={item.id}
              type="button"
              className="flex-1 py-3 text-center font-medium"
              style={{ color: tab === item.id ? "#fff" : "#c4c4c4", boxShadow: tab === item.id ? "inset 0 -3px 0 #fff" : undefined, opacity: locked ? 0.4 : undefined }}
              aria-current={tab === item.id ? "true" : undefined}
              aria-disabled={locked || undefined}
              disabled={locked}
              onClick={() => {
                if (locked) return;
                onTab(item.id);
              }}
            >
              {item.label}
            </button>
          );
        })}
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
                if (await onSaveInfo({ ...draft, title })) setEditing(false);
              }}
            />
          ) : (
            <>
              <TabActions onEdit={startEdit} />
              <div className="px-4 py-4" style={{ overflowWrap: "anywhere" }}>
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
                    <p className="text-start" style={{ whiteSpace: "pre-line" }}>
                      <LinkedText text={comments} />
                    </p>
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
          <StepEditor steps={recipe.document.steps} busy={busy} onCancel={() => setEditing(false)} onSave={(steps) => onSaveSteps(steps, title)} />
        ) : (
          <div style={{ overflowWrap: "anywhere" }}>
            <TabActions onEdit={startEdit} extra={<ClearMarksButton onClick={() => onClear("steps")} />} />
            {recipe.document.steps.map((step, index) => {
              const itemNumber = recipe.document.steps.filter((item, itemIndex) => !isSubtitle(item.text) && itemIndex <= index).length;
              return isSubtitle(step.text) ? (
                <div key={`${step.number}-${index}`} className="flex items-start gap-3 px-4 py-3">
                  <p className="min-w-0 flex-1 text-start font-semibold">{step.text}</p>
                  {advanced ? (
                    <>
                      <StepButton label={`הפיכת ${step.text.replace(/:$/, "")} לשלב`} disabled={busy} onClick={() => onMakeStepItem(index)} />
                      <MoveAcrossButton label={`העברת ${step.text} למצרכים`} disabled={busy} onClick={() => onMoveStep(index)} />
                    </>
                  ) : null}
                </div>
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
                  {advanced ? (
                    <>
                      <SubheaderButton label={`הפיכת שלב ${itemNumber} לכותרת`} disabled={busy} onClick={() => onMakeStepSubtitle(index)} />
                      <MoveAcrossButton label={`העברת שלב ${itemNumber} למצרכים`} disabled={busy} onClick={() => onMoveStep(index)} />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : null}
      {tab === "ingredients" ? (
        editing ? (
          <IngredientEditor ingredients={recipe.document.ingredients} busy={busy} onCancel={() => setEditing(false)} onSave={(ingredients) => onSaveIngredients(ingredients, title)} />
        ) : (
          <div style={{ overflowWrap: "anywhere" }}>
            <TabActions onEdit={startEdit} extra={<ClearMarksButton onClick={() => onClear("ingredients")} />} />
            {recipe.document.ingredients.map((ingredient, index) =>
              isSubtitle(ingredientName(ingredient)) ? (
                <div key={`${ingredient.text}-${index}`} className="flex items-start gap-3 px-4 py-3">
                  <p className="min-w-0 flex-1 text-start font-semibold">{ingredientName(ingredient)}</p>
                  {advanced ? <MoveAcrossButton label={`העברת ${ingredientName(ingredient)} להכנה`} disabled={busy} onClick={() => onMoveIngredient(index)} /> : null}
                </div>
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
                  {advanced ? (
                    <>
                      <SubheaderButton label={`הפיכת ${ingredientName(ingredient)} לכותרת`} disabled={busy} onClick={() => onMakeIngredientSubtitle(index)} />
                      <MoveAcrossButton label={`העברת ${ingredientName(ingredient)} להכנה`} disabled={busy} onClick={() => onMoveIngredient(index)} />
                    </>
                  ) : null}
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
    <button type="button" className="grid size-8 place-items-center" aria-label="מחיקת סימונים" onClick={onClick}>
      <ClearMarksIcon className="size-5" />
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
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  useLayoutEffect(() => {
    if (focusKey) setFocusKey(null);
  }, [focusKey]);
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
                <EditRow
                  open={openKey === row.key}
                  summary={<IngredientSummary row={row} />}
                  onToggle={() => {
                    if (openKey === row.key) {
                      setOpenKey(null);
                      return;
                    }
                    setOpenKey(row.key);
                    setFocusKey(row.key);
                  }}
                  onDelete={() => {
                    setRows((current) => current.filter((item) => item.key !== row.key));
                    setOpenKey((current) => (current === row.key ? null : current));
                  }}
                  middle={
                    <button type="button" className="text-sm font-medium text-[var(--teal)]" onClick={() => setRows((current) => current.map((item) => (item.key === row.key ? toggleIngredientKind(item) : item)))}>
                      {row.heading ? "הפיכה למצרך" : "הפיכה לכותרת"}
                    </button>
                  }
                >
                  {row.heading ? (
                    <Field compact autoFocus={focusKey === row.key} label="כותרת" value={row.name.replace(/:$/, "")} onChange={(name) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, name } : item)))} />
                  ) : (
                    <>
                      <Field compact autoFocus={focusKey === row.key} label={`מצרך ${itemNumber}`} value={row.name} onChange={(name) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, name } : item)))} />
                      <div className="grid grid-cols-2 gap-2">
                        <Field compact label="כמות" value={row.quantity} onChange={(quantity) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, quantity } : item)))} />
                        <UnitField unit={row.unit} onChange={(unit) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, unit } : item)))} />
                      </div>
                      <Field compact label="הערה" value={row.note} onChange={(note) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, note } : item)))} />
                    </>
                  )}
                </EditRow>
              </SortableStep>
            );
          })}
        </SortableContext>
      </DndContext>
      <div className="flex items-center justify-start gap-2 px-4 py-3">
        <AddButton
          label="הוספת מצרך"
          onClick={() => {
            const key = crypto.randomUUID();
            setRows((current) => [...current, { key, heading: false, name: "", quantity: "", unit: "יחידה", note: "" }]);
            setOpenKey(key);
            setFocusKey(key);
          }}
        />
        <AddButton
          label="הוספת כותרת"
          onClick={() => {
            const key = crypto.randomUUID();
            setRows((current) => [...current, { key, heading: true, name: "", quantity: "", unit: "", note: "" }]);
            setOpenKey(key);
            setFocusKey(key);
          }}
        />
        <PasteButton onClick={() => setPasteOpen(true)} />
      </div>
      {usage ? <TokenNote usage={usage} /> : null}
      {pasteOpen ? (
        <PasteRecipeDialog
          kind="ingredients"
          onClose={() => setPasteOpen(false)}
          onApply={(parsed, nextUsage) => {
            const next = (parsed as ParsedIngredient[]).map((row) => ({
              key: crypto.randomUUID(),
              heading: row.heading,
              name: row.name,
              quantity: row.quantity,
              unit: row.heading ? "" : row.unit || "יחידה",
              note: row.note,
            }));
            setRows(next);
            setUsage(nextUsage);
            setOpenKey(null);
            setPasteOpen(false);
          }}
        />
      ) : null}
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
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  useLayoutEffect(() => {
    if (focusKey) setFocusKey(null);
  }, [focusKey]);
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
                <EditRow
                  open={openKey === row.key}
                  summary={<StepSummary row={row} number={itemNumber} />}
                  onToggle={() => {
                    if (openKey === row.key) {
                      setOpenKey(null);
                      return;
                    }
                    setOpenKey(row.key);
                    setFocusKey(row.key);
                  }}
                  onDelete={() => {
                    setRows((current) => current.filter((item) => item.key !== row.key));
                    setOpenKey((current) => (current === row.key ? null : current));
                  }}
                >
                  {row.heading ? (
                    <Field compact autoFocus={focusKey === row.key} label="כותרת" value={row.text.replace(/:$/, "")} onChange={(text) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, text } : item)))} />
                  ) : (
                    <StepText label={`שלב ${itemNumber}`} value={row.text} autoFocus={focusKey === row.key} onChange={(text) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, text } : item)))} />
                  )}
                </EditRow>
              </SortableStep>
            );
          })}
        </SortableContext>
      </DndContext>
      <div className="flex items-center justify-start gap-2 px-4 py-3">
        <AddButton
          label="הוספת שלב"
          onClick={() => {
            const key = crypto.randomUUID();
            setRows((current) => [...current, { key, heading: false, text: "" }]);
            setOpenKey(key);
            setFocusKey(key);
          }}
        />
        <AddButton
          label="הוספת כותרת"
          onClick={() => {
            const key = crypto.randomUUID();
            setRows((current) => [...current, { key, heading: true, text: "" }]);
            setOpenKey(key);
            setFocusKey(key);
          }}
        />
        <PasteButton onClick={() => setPasteOpen(true)} />
      </div>
      {usage ? <TokenNote usage={usage} /> : null}
      {pasteOpen ? (
        <PasteRecipeDialog
          kind="steps"
          onClose={() => setPasteOpen(false)}
          onApply={(parsed, nextUsage) => {
            const next = (parsed as ParsedStep[]).map((row) => ({ key: crypto.randomUUID(), heading: row.heading, text: row.text }));
            setRows(next);
            setUsage(nextUsage);
            setOpenKey(null);
            setPasteOpen(false);
          }}
        />
      ) : null}
    </form>
  );
}

function EditRow({ open, summary, onToggle, onDelete, middle, children }: { open: boolean; summary: React.ReactNode; onToggle: () => void; onDelete: () => void; middle?: React.ReactNode; children: React.ReactNode }) {
  if (!open) {
    return (
      <button type="button" className="flex w-full items-center gap-2 py-1 text-start" aria-expanded={false} onClick={onToggle}>
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronIcon className="size-4 shrink-0 text-neutral-400" style={{ transform: "rotate(180deg)" }} />
      </button>
    );
  }
  return (
    <div>
      {children}
      <div className="mt-3" style={middle ? { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" } : { display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button type="button" className="text-sm font-medium text-[var(--teal)]" style={middle ? { justifySelf: "start" } : undefined} aria-expanded={true} onClick={onToggle}>
          סגירה
        </button>
        {middle}
        <button type="button" className="text-sm text-red-600" style={middle ? { justifySelf: "end" } : undefined} onClick={onDelete}>
          מחיקה
        </button>
      </div>
    </div>
  );
}

function IngredientSummary({ row }: { row: IngredientRow }) {
  if (row.heading) {
    const title = row.name.trim().replace(/:$/, "");
    return <span className={`block truncate font-semibold ${title ? "" : "text-neutral-400"}`}>{title ? `${title}:` : "כותרת חדשה"}</span>;
  }
  const amount = formatAmount(row.quantity.trim() || null, row.unit.trim() || null);
  const name = row.name.trim();
  const note = row.note.trim();
  return (
    <span className="block text-start">
      <span className="flex items-start justify-between gap-3">
        <span className={`min-w-0 flex-1 truncate ${name ? "font-medium" : "text-neutral-400"}`}>{name || "מצרך חדש"}</span>
        {amount ? <span className="shrink-0 text-neutral-700">{amount}</span> : null}
      </span>
      {note ? <span className="mt-1 block truncate text-sm font-normal text-neutral-600">{note}</span> : null}
    </span>
  );
}

function StepSummary({ row, number }: { row: StepRow; number: number }) {
  if (row.heading) {
    const title = row.text.trim().replace(/:$/, "");
    return <span className={`block truncate font-semibold ${title ? "" : "text-neutral-400"}`}>{title ? `${title}:` : "כותרת חדשה"}</span>;
  }
  const text = row.text.trim();
  return (
    <span className="block text-start" style={text ? { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" } : undefined}>
      <span className="me-2">{number}.</span>
      <span className={text ? "" : "text-neutral-400"}>{text || "שלב חדש"}</span>
    </span>
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

function TokenNote({ usage, className = "px-4 pb-3 text-start text-sm text-neutral-600" }: { usage: TokenUsage; className?: string }) {
  const count = (value: number) => value.toLocaleString("he-IL");
  return (
    <p className={className}>
      נוצלו <bdi>{count(usage.total)}</bdi> טוקנים (קלט <bdi>{count(usage.prompt)}</bdi>, פלט <bdi>{count(usage.output)}</bdi>
      {usage.thoughts > 0 ? (
        <>
          , חשיבה <bdi>{count(usage.thoughts)}</bdi>
        </>
      ) : null}
      )
    </p>
  );
}

function PasteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="grid h-8 place-items-center rounded border border-neutral-800 px-2 text-sm font-medium" onClick={onClick}>
      הדבקה
    </button>
  );
}

function PasteRecipeDialog({ kind, onClose, onApply }: { kind: "ingredients" | "steps"; onClose: () => void; onApply: (rows: ParsedIngredient[] | ParsedStep[], usage: TokenUsage | null) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!pending) return;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const title = kind === "ingredients" ? "הדבקת מצרכים" : "הדבקת שלבי הכנה";
  function close() {
    abortRef.current?.abort();
    onClose();
  }
  async function convert() {
    const source = text.trim();
    if (!source || pending) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setUsage(null);
    setPending(true);
    try {
      const response = await fetch("/api/recipe-parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, text: source }),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as { rows?: ParsedIngredient[] | ParsedStep[]; error?: string; usage?: TokenUsage | null } | null;
      if (body?.usage) setUsage(body.usage);
      if (!response.ok || !body?.rows?.length) {
        setError(body?.error || "לא ניתן להמיר את הטקסט");
        return;
      }
      onApply(body.rows, body.usage ?? null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("לא ניתן להמיר את הטקסט");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setPending(false);
    }
  }
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <Overlay label={title} onClose={close}>
      <h3 className="text-start text-lg font-semibold">{title}</h3>
      <textarea
        dir="rtl"
        rows={8}
        value={text}
        maxLength={12000}
        readOnly={pending}
        placeholder={kind === "ingredients" ? "הדביקו כאן את רשימת המצרכים" : "הדביקו כאן את שלבי ההכנה"}
        aria-label={title}
        className="mt-3 w-full resize-none rounded-xl border border-neutral-300 px-3 py-2 outline-none"
        onChange={(event) => setText(event.target.value)}
      />
      {error ? <p className="mt-2 text-start text-sm text-red-700">{error}</p> : null}
      {usage && !pending ? <TokenNote usage={usage} className="mt-2 text-start text-sm text-neutral-600" /> : null}
      {pending ? (
        <div className="mt-4 flex items-center justify-center gap-3 py-3" role="status">
          <span aria-hidden className="inline-block size-5 rounded-full border-2 border-neutral-200" style={{ borderTopColor: "var(--teal)", animation: "cnaan-spin 0.8s linear infinite" }} />
          <span>ממיר את הטקסט · {clock}</span>
        </div>
      ) : (
        <button type="button" className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40" disabled={!text.trim()} onClick={() => void convert()}>
          המרה
        </button>
      )}
      <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={close}>
        ביטול
      </button>
    </Overlay>
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

function LinkRecipeDialog({
  kind,
  shared,
  categories,
  onClose,
  onDone,
}: {
  kind: "link" | "text";
  shared: SharedLink | null;
  categories: CategoryChoice[];
  onClose: () => void;
  onDone: (recipe: ImportedRecipe) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!pending) return;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);
  useEffect(() => () => abortRef.current?.abort(), []);
  async function convert(source: SharedLink) {
    if (pending) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setUsage(null);
    setPending(true);
    try {
      const response = await fetch("/api/recipe-from-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...source, textOnly: kind === "text", categories }),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as (ImportedRecipe & { error?: string; usage?: TokenUsage | null }) | null;
      if (body?.usage) setUsage(body.usage);
      if (!response.ok || !body?.title) {
        setError(body?.error || (kind === "text" ? "לא ניתן להמיר את הטקסט" : "לא ניתן לקרוא את הקישור"));
        return;
      }
      onDone(body);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(kind === "text" ? "לא ניתן להמיר את הטקסט" : "לא ניתן לקרוא את הקישור");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setPending(false);
    }
  }
  useEffect(() => {
    if (!shared || startedRef.current) return;
    startedRef.current = true;
    void convert(shared);
  }, [shared]);
  function close() {
    abortRef.current?.abort();
    onClose();
  }
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const pasted = text.trim();
  const title = kind === "text" ? "מתכון מטקסט" : "מתכון מקישור";
  return (
    <Overlay label={title} onClose={close}>
      <h3 className="text-start text-lg font-semibold">{title}</h3>
      {shared ? null : (
        <textarea
          dir="rtl"
          rows={kind === "text" ? 10 : 4}
          value={text}
          readOnly={pending}
          placeholder={kind === "text" ? "הדביקו כאן את המתכון" : "הדביקו כאן קישור לפוסט או לאתר"}
          aria-label={kind === "text" ? "טקסט המתכון" : "קישור"}
          className="mt-3 w-full resize-none rounded-xl border border-neutral-300 px-3 py-2 outline-none"
          onChange={(event) => setText(event.target.value)}
        />
      )}
      {error ? <p className="mt-2 text-start text-sm text-red-700">{error}</p> : null}
      {usage && !pending ? <TokenNote usage={usage} className="mt-2 text-start text-sm text-neutral-600" /> : null}
      {pending ? (
        <div className="mt-4 flex items-center justify-center gap-3 py-3" role="status">
          <span aria-hidden className="inline-block size-5 rounded-full border-2 border-neutral-200" style={{ borderTopColor: "var(--teal)", animation: "cnaan-spin 0.8s linear infinite" }} />
          <span>{kind === "text" ? "ממיר את המתכון" : "קורא את הקישור"} · {clock}</span>
        </div>
      ) : shared ? null : (
        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40"
          disabled={!pasted}
          onClick={() => void convert(kind === "text" ? { title: "", text: pasted, url: "" } : { title: "", text: pasted, url: pasted })}
        >
          המרה
        </button>
      )}
      <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" onClick={close}>
        ביטול
      </button>
    </Overlay>
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
          title: recipe.title,
          sourceText,
          sourceUrl,
          notes: comments.trim() ? [comments.trim()] : [],
          categoryIds,
        });
      }}
    >
      <TabActions editing busy={busy} onCancel={onCancel} />
      <div className="px-4 pb-4">
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

function DesktopRowButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="size-6 shrink-0 text-[var(--teal)] disabled:opacity-40" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function MoveAcrossButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <DesktopRowButton label={label} disabled={disabled} onClick={onClick}>
      <MoveAcrossIcon className="size-4" />
    </DesktopRowButton>
  );
}

function SubheaderButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <DesktopRowButton label={label} disabled={disabled} onClick={onClick}>
      <SubheaderIcon className="size-4" />
    </DesktopRowButton>
  );
}

function StepButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <DesktopRowButton label={label} disabled={disabled} onClick={onClick}>
      <StepIcon className="size-4" />
    </DesktopRowButton>
  );
}

function ingredientMoveText(ingredient: RecipeIngredient | undefined) {
  const name = ingredient ? ingredientName(ingredient).trim() : "";
  if (!name) return "";
  return isSubtitle(name) ? (name.endsWith(":") ? name : `${name}:`) : name.replace(/:$/, "");
}

function ingredientFromStep(step: RecipeStep | undefined): RecipeIngredient | null {
  const text = step?.text.trim() ?? "";
  if (!text) return null;
  if (isSubtitle(text)) {
    const title = text.endsWith(":") ? text : `${text}:`;
    return { text: title, quantity: null, unit: null, product: title, note: null };
  }
  return { text, quantity: null, unit: null, product: text, note: null };
}

function shiftChecks(indexes: number[], removed: number) {
  return indexes.filter((index) => index !== removed).map((index) => (index > removed ? index - 1 : index));
}

function toggleIngredientKind(row: IngredientRow): IngredientRow {
  const name = row.name.trim().replace(/:$/, "");
  if (row.heading) return { ...row, heading: false, name, quantity: "", unit: "יחידה", note: "" };
  return { ...row, heading: true, name, quantity: "", unit: "", note: "" };
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

const recipeUnits = ["גרם", 'ק"ג', 'מ"ל', "ליטר", "כוס", "כף", "כפית", "שן", "חבילה", "שקית", "קופסה", "בקבוק", "קורט", "צרור", "חופן", "יחידה"];

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
  חופנים: "חופן",
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

function splitUrl(raw: string) {
  let href = raw;
  let trailing = "";
  const peel = () => {
    trailing = href.slice(-1) + trailing;
    href = href.slice(0, -1);
  };
  while (href && /[.,;:!?]$/.test(href)) peel();
  while (href.endsWith(")") && href.split(")").length > href.split("(").length) peel();
  while (href.endsWith("]") && href.split("]").length > href.split("[").length) peel();
  return { href, trailing };
}

function LinkedText({ text }: { text: string }) {
  const parts: { key: string; text: string; href: string | null }[] = [];
  const pattern = /https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/gi;
  let cursor = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const { href, trailing } = splitUrl(match[0]);
    if (start > cursor) parts.push({ key: `t${index}`, text: text.slice(cursor, start), href: null });
    if (href) parts.push({ key: `u${index}`, text: href, href });
    if (trailing) parts.push({ key: `r${index}`, text: trailing, href: null });
    cursor = start + match[0].length;
    index += 1;
  }
  if (cursor < text.length) parts.push({ key: "end", text: text.slice(cursor), href: null });
  return parts.map((part) =>
    part.href ? (
      <a key={part.key} href={part.href} target="_blank" rel="noreferrer" dir="ltr" style={{ color: "#1d4ed8", textDecoration: "underline", unicodeBidi: "isolate" }}>
        {part.text}
      </a>
    ) : (
      <span key={part.key}>{part.text}</span>
    ),
  );
}

function Field({ label, value, onChange, compact = false, autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!autoFocus || !ref.current) return;
    const field = ref.current;
    field.focus();
    const end = field.value.length;
    field.setSelectionRange(end, end);
    field.scrollIntoView({ block: "center" });
  }, [autoFocus]);
  return (
    <label className={`${compact ? "mt-2" : "mt-3"} block text-start`}>
      <span className="mb-1 block text-sm">{label}</span>
      <input ref={ref} className="w-full rounded-xl border border-neutral-300 px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function StepText({ label, value, onChange, autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!autoFocus || !ref.current) return;
    const field = ref.current;
    field.focus();
    const end = field.value.length;
    field.setSelectionRange(end, end);
    field.scrollIntoView({ block: "center" });
  }, [autoFocus]);
  return (
    <label className="block text-start">
      <span className="mb-1 block text-sm">{label}</span>
      <textarea ref={ref} className="w-full rounded-xl border border-neutral-300 px-3 py-2" rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
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
