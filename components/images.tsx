"use client";

import { useEffect, useRef, useState } from "react";

import { CameraIcon, CheckIcon, CloseIcon, FolderIcon, ImageIcon, TrashIcon } from "@/components/icons";

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
  return (
    <button
      type="button"
      className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.();
      }}
      aria-label={`הגדלת התמונה של ${label}`}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <ImageIcon className="size-1/2" />}
    </button>
  );
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
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/85 p-4" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="ms-auto grid size-10 place-items-center text-white" onClick={onClose} aria-label="סגירה">
        <CloseIcon className="size-6" />
      </button>
      {src ? (
        <img src={src} alt={label} className="mx-auto my-auto max-h-[70vh] max-w-full rounded-lg object-contain" />
      ) : (
        <div className="mx-auto my-auto grid size-48 place-items-center rounded-full bg-white/10 text-white">
          <ImageIcon className="size-16" />
        </div>
      )}
      <div className="mx-auto mt-4">
        <ImagePicker hasImage={Boolean(src)} variant="dark" onFile={onReplace} onRemove={onRemove} />
      </div>
    </div>
  );
}

export function ImagePicker({
  hasImage,
  variant,
  onFile,
  onRemove,
}: {
  hasImage: boolean;
  variant: "dark" | "light";
  onFile: (file: File) => void;
  onRemove?: () => void;
}) {
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
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
