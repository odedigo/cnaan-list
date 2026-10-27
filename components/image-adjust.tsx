"use client";

/** Crop and rotate a chosen picture before it is saved. */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { RecipeCrop } from "@/components/recipe-crop";
import { cropImageFile, rotateCrop, rotateImageFile, type CropFractions } from "@/lib/images";

const FULL: CropFractions = { x: 0, y: 0, width: 1, height: 1 };

export function ImageAdjust({
  file,
  busy = false,
  onConfirm,
  onCancel,
}: {
  file: File;
  busy?: boolean;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}) {
  const [source, setSource] = useState(file);
  const [photo, setPhoto] = useState(file);
  const [url, setUrl] = useState("");
  const [quarter, setQuarter] = useState(0);
  const [turning, setTurning] = useState(false);
  const [working, setWorking] = useState(false);
  const [crop, setCrop] = useState<CropFractions>(FULL);
  const [error, setError] = useState("");

  useEffect(() => {
    setSource(file);
    setPhoto(file);
    setQuarter(0);
    setCrop(FULL);
    setError("");
  }, [file]);

  useEffect(() => {
    const next = URL.createObjectURL(photo);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo]);

  async function turn(direction: "left" | "right") {
    if (turning || working || busy) return;
    const next = (quarter + (direction === "right" ? 1 : 3)) % 4;
    setTurning(true);
    setError("");
    try {
      const turned = await rotateImageFile(source, next);
      setQuarter(next);
      setCrop((current) => rotateCrop(current, direction));
      setPhoto(turned);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא ניתן לסובב את התמונה");
    } finally {
      setTurning(false);
    }
  }

  async function confirm() {
    if (turning || working || busy) return;
    setWorking(true);
    setError("");
    try {
      onConfirm(await cropImageFile(photo, crop));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא ניתן לקרוא את התמונה");
      setWorking(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="התאמת תמונה" onClick={onCancel}>
      <div className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4" style={{ maxHeight: "90dvh" }} onClick={(event) => event.stopPropagation()}>
        <h3 className="text-start text-lg font-semibold">התאמת תמונה</h3>
        <p className="mt-1 text-start text-sm text-neutral-600">גררו את הקצוות או הפינות כדי לחתוך, או סובבו את התמונה.</p>
        {url ? <RecipeCrop src={url} crop={crop} disabled={turning || working || busy} onChange={setCrop} onTurn={(direction) => void turn(direction)} /> : null}
        {error ? <p className="mt-2 text-start text-sm text-red-700">{error}</p> : null}
        <button type="button" className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white disabled:opacity-40" disabled={turning || working || busy} onClick={() => void confirm()}>
          {working ? "מכין…" : "שימוש בתמונה"}
        </button>
        <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium" disabled={working} onClick={onCancel}>
          ביטול
        </button>
      </div>
    </div>,
    document.body,
  );
}
