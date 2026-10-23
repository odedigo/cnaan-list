"use client";

/** Product and category image thumbnail, lightbox, and picker. */

import { useEffect, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";

import { CameraIcon, CheckIcon, CloseIcon, FolderIcon, ImageIcon, SearchIcon, TrashIcon } from "@/components/icons";

function denied(error: unknown) {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
}

export function ImageBubble({
  src,
  label,
  onOpen,
  size = "size-12",
}: {
  src: string | null;
  label: string;
  onOpen?: () => void;
  size?: string;
}) {
  const picture = src ? <img src={src} alt="" className="absolute inset-0 size-full object-contain" /> : <ImageIcon className="size-1/2" />;
  const className = `relative grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400`;
  if (!onOpen) return <span className={className}>{picture}</span>;
  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`הגדלת התמונה של ${label}`}
    >
      {picture}
    </button>
  );
}

function desktopCanDrop() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function droppedImage(transfer: DataTransfer) {
  return Array.from(transfer.files).find((file) => file.type.startsWith("image/")) ?? null;
}

export function Lightbox({
  src,
  label,
  onClose,
  onReplace,
  onRemove,
}: {
  src: string | null;
  label: string;
  onClose: () => void;
  onReplace: (file: File) => void;
  onRemove?: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  function onDragEnter(event: DragEvent) {
    if (!desktopCanDrop() || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }

  function onDragOver(event: DragEvent) {
    if (!desktopCanDrop() || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent) {
    if (!desktopCanDrop()) return;
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragOver(false);
    }
  }

  function onDrop(event: DragEvent) {
    if (!desktopCanDrop()) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const file = droppedImage(event.dataTransfer);
    if (file) onReplace(file);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div
        className="relative flex w-full max-w-sm flex-col items-center rounded-2xl bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <button type="button" className="ms-auto grid size-9 place-items-center text-neutral-700" onClick={onClose} aria-label="סגירה">
          <CloseIcon className="size-5" />
        </button>
        {src ? (
          <img src={src} alt={label} className="max-h-[45vh] w-full rounded-lg object-contain" />
        ) : (
          <div className="grid size-32 place-items-center rounded-full bg-neutral-100 text-neutral-400">
            <ImageIcon className="size-12" />
          </div>
        )}
        {dragOver ? (
          <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-2xl border-2 border-dashed border-neutral-400 bg-white/80 text-lg text-neutral-800">
            שחררו להעלאת תמונה
          </div>
        ) : null}
        <div className="mt-4">
          <ImagePicker hasImage={Boolean(src)} variant="light" searchName={label} onFile={onReplace} onRemove={onRemove} />
        </div>
      </div>
    </div>
  );
}

export function ImagePicker({
  hasImage,
  variant,
  searchName = "",
  onFile,
  onRemove,
}: {
  hasImage: boolean;
  variant: "dark" | "light";
  searchName?: string;
  onFile: (file: File) => void;
  onRemove?: () => void;
}) {
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const buttonClass =
    variant === "dark"
      ? "grid size-11 cursor-pointer place-items-center rounded-xl bg-white text-neutral-900"
      : "grid size-10 cursor-pointer place-items-center rounded-full border border-neutral-300 bg-white text-neutral-900";
  const removeClass =
    variant === "dark"
      ? "grid size-11 cursor-pointer place-items-center rounded-xl bg-white text-red-600"
      : "grid size-10 cursor-pointer place-items-center rounded-full border border-red-200 bg-red-50 text-red-600";

  useEffect(() => {
    return () => {
      if (pending) URL.revokeObjectURL(pending.url);
    };
  }, [pending]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOpen || !video || !stream) return;
    video.srcObject = stream;
    void video.play();
  }, [cameraOpen]);

  function stageCamera(file: File) {
    setPending((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { file, url: URL.createObjectURL(file) };
    });
  }

  function discard() {
    setPending((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }

  async function openCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("המצלמה אינה זמינה בדפדפן זה");
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (error) {
        if (denied(error)) throw error;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (error) {
      setCameraError(denied(error) ? "יש לאשר גישה למצלמה" : "לא ניתן לפתוח את המצלמה");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 300;
    canvas.height = video.videoHeight || 300;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      stopCamera();
      if (!blob) return;
      stageCamera(new File([blob], "camera.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  return (
    <>
      <div className={`flex items-center justify-center ${variant === "dark" ? "gap-2" : "gap-1"}`}>
        <label className={buttonClass} aria-label={hasImage ? "החלפת תמונה" : "בחירת תמונה"}>
          <FolderIcon className="size-6" />
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onFile(file);
            }}
          />
        </label>
        <button type="button" className={buttonClass} aria-label="צילום" onClick={() => void openCamera()}>
          <CameraIcon className="size-6" />
        </button>
        <button type="button" className={`${buttonClass} hidden`} aria-label="חיפוש תמונה" onClick={() => setSearchOpen(true)}>
          <SearchIcon className="size-6" />
        </button>
        {hasImage && onRemove ? (
          <button type="button" className={removeClass} aria-label="הסרת תמונה" onClick={() => setConfirmRemove(true)}>
            <TrashIcon className="size-5" />
          </button>
        ) : null}
      </div>
      {cameraError ? <p className={`mt-1 text-center text-xs ${variant === "dark" ? "text-white" : "text-red-600"}`}>{cameraError}</p> : null}
      {cameraOpen ? (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black p-4" role="dialog" aria-modal="true" aria-label="מצלמה">
          <video ref={videoRef} autoPlay playsInline muted className="mx-auto my-auto max-h-[70vh] max-w-full rounded-lg" />
          <div className="mx-auto mt-4 flex items-center gap-3">
            <button type="button" className="grid size-14 place-items-center rounded-full bg-[var(--teal)] text-white" aria-label="צילום" onClick={capture}>
              <CameraIcon className="size-7" />
            </button>
            <button type="button" className="grid size-14 place-items-center rounded-full bg-white text-neutral-700" aria-label="ביטול" onClick={stopCamera}>
              <CloseIcon className="size-6" />
            </button>
          </div>
        </div>
      ) : null}
      {pending ? (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="אישור תמונה">
          <img src={pending.url} alt="" className="mx-auto my-auto max-h-[70vh] max-w-full rounded-lg object-contain" />
          <div className="mx-auto mt-4 flex items-center gap-3">
            <button
              type="button"
              className="grid size-14 place-items-center rounded-full bg-[var(--teal)] text-white"
              aria-label="שימוש בתמונה"
              onClick={() => {
                onFile(pending.file);
                discard();
              }}
            >
              <CheckIcon className="size-7" />
            </button>
            <button type="button" className="grid size-14 place-items-center rounded-full bg-white text-neutral-700" aria-label="ביטול" onClick={discard}>
              <CloseIcon className="size-6" />
            </button>
          </div>
        </div>
      ) : null}
      {searchOpen ? (
        <ImageSearch
          initialQuery={searchName.trim()}
          onFile={(file) => {
            onFile(file);
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}
      {confirmRemove ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="אישור הסרת תמונה">
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-center">
            <p className="text-sm font-medium">להסיר את התמונה?</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-red-50 py-3 font-medium text-red-700"
              onClick={() => {
                setConfirmRemove(false);
                onRemove?.();
              }}
            >
              אישור מחיקה
            </button>
            <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={() => setConfirmRemove(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

type SearchImage = { title: string; thumb: string; url: string };

function ImageSearch({ initialQuery, onFile, onClose }: { initialQuery: string; onFile: (file: File) => void; onClose: () => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [images, setImages] = useState<SearchImage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  async function search(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setImages([]);
      setSelected(null);
      setMessage("יש להזין חיפוש");
      return;
    }
    setSearching(true);
    setMessage("");
    setSelected(null);
    try {
      const response = await fetch(`/api/image-search?q=${encodeURIComponent(trimmed)}`);
      const body = (await response.json()) as { images?: SearchImage[]; error?: string };
      if (!response.ok) {
        setImages([]);
        setMessage(body.error ?? "לא ניתן לחפש תמונות");
        return;
      }
      const next = body.images ?? [];
      setImages(next);
      setMessage(next.length === 0 ? "לא נמצאו תמונות" : "");
    } catch {
      setImages([]);
      setMessage("לא ניתן לחפש תמונות");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (initialQuery) void search(initialQuery);
  }, [initialQuery]);

  async function choose() {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/image-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: selected }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(body?.error ?? "לא ניתן להוריד את התמונה");
        return;
      }
      const blob = await response.blob();
      const type = blob.type || "image/jpeg";
      const extension = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
      onFile(new File([blob], `search.${extension}`, { type }));
    } catch {
      setMessage("לא ניתן להוריד את התמונה");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[85] flex justify-center bg-[var(--cream)]">
    <div className="flex h-full w-full max-w-[480px] flex-col" role="dialog" aria-modal="true" aria-label="חיפוש תמונה">
      <form
        className="flex items-center gap-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void search(query);
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="מילות חיפוש"
          placeholder="מילות חיפוש"
          className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 outline-none focus:border-[var(--teal)]"
        />
        <button type="submit" disabled={searching} className="rounded-xl bg-[var(--teal)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
          {searching ? "מחפש…" : "חיפוש"}
        </button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {message ? <p className="py-6 text-center text-sm text-neutral-600">{message}</p> : null}
        <div className="grid grid-cols-3 gap-2 pb-3">
          {images.map((image) => (
            <button
              key={image.url}
              type="button"
              aria-label={image.title}
              aria-pressed={selected === image.url}
              className={`aspect-square overflow-hidden rounded-xl bg-white ${selected === image.url ? "ring-2 ring-[var(--teal)]" : ""}`}
              onClick={() => setSelected(image.url)}
            >
              <img src={image.thumb} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" disabled={!selected || saving} onClick={() => void choose()} className="flex-1 rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-60">
          {saving ? "מוריד…" : "בחירה"}
        </button>
        <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700">
          ביטול
        </button>
      </div>
    </div>
    </div>,
    document.body,
  );
}
