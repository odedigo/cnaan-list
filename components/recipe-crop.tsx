"use client";

/** Crop rectangle for a recipe photo. Edges and corners resize the frame, and the turn icons rotate it. */

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import type { CropFractions } from "@/lib/images";

const HANDLES = ["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const;
type Handle = (typeof HANDLES)[number];

const LABELS: Record<Handle, string> = {
  n: "הקצה העליון",
  s: "הקצה התחתון",
  e: "הקצה הימני",
  w: "הקצה השמאלי",
  nw: "הפינה השמאלית העליונה",
  ne: "הפינה הימנית העליונה",
  sw: "הפינה השמאלית התחתונה",
  se: "הפינה הימנית התחתונה",
};

type Frame = { x: number; y: number; width: number; height: number };

export function RecipeCrop({
  src,
  crop,
  disabled,
  onChange,
  onTurn,
}: {
  src: string;
  crop: CropFractions;
  disabled: boolean;
  onChange: (crop: CropFractions) => void;
  onTurn: (direction: "left" | "right") => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cropRef = useRef(crop);
  const frameRef = useRef<Frame | null>(null);
  const dragRef = useRef<Handle | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  cropRef.current = crop;

  useEffect(() => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return;
    const measure = () => {
      const next = imageFrame(image, stage);
      frameRef.current = next;
      setFrame(next);
    };
    measure();
    image.addEventListener("load", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => {
      image.removeEventListener("load", measure);
      observer.disconnect();
    };
  }, [src]);

  function begin(handle: Handle, event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || !frameRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = handle;
    cropRef.current = crop;
  }

  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const handle = dragRef.current;
    const box = frameRef.current;
    const stage = stageRef.current;
    if (!handle || !box || !stage) return;
    const origin = stage.getBoundingClientRect();
    const point = {
      x: (event.clientX - origin.left - box.x) / box.width,
      y: (event.clientY - origin.top - box.y) / box.height,
    };
    const minX = Math.min(0.5, 48 / box.width);
    const minY = Math.min(0.5, 48 / box.height);
    const next = resizeCrop(cropRef.current, handle, point, minX, minY);
    cropRef.current = next;
    onChange(next);
  }

  function end() {
    dragRef.current = null;
  }

  return (
    <div
      ref={stageRef}
      dir="ltr"
      className="relative mt-3 overflow-hidden rounded-xl bg-neutral-900"
      style={{ height: 320, touchAction: "none", userSelect: "none" }}
    >
      <img ref={imageRef} alt="התמונה שנבחרה" src={src} draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      {frame ? (
        <div style={{ position: "absolute", left: frame.x, top: frame.y, width: frame.width, height: frame.height }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${crop.y * 100}%`, background: "rgba(0,0,0,.5)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${(1 - crop.y - crop.height) * 100}%`, background: "rgba(0,0,0,.5)" }} />
          <div style={{ position: "absolute", top: `${crop.y * 100}%`, height: `${crop.height * 100}%`, left: 0, width: `${crop.x * 100}%`, background: "rgba(0,0,0,.5)" }} />
          <div style={{ position: "absolute", top: `${crop.y * 100}%`, height: `${crop.height * 100}%`, right: 0, width: `${(1 - crop.x - crop.width) * 100}%`, background: "rgba(0,0,0,.5)" }} />
          <div style={{ position: "absolute", left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%`, border: "2px solid #fff" }}>
            {HANDLES.map((handle) => (
              <button
                key={handle}
                type="button"
                aria-label={LABELS[handle]}
                disabled={disabled}
                style={{ ...handleStyle(handle), touchAction: "none" }}
                onPointerDown={(event) => begin(handle, event)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
              >
                <span style={handleMark(handle)} />
              </button>
            ))}
          </div>
          <TurnButton label="סיבוב שמאלה" direction="left" disabled={disabled} style={{ left: 8, top: 8 }} onTurn={onTurn} />
          <TurnButton label="סיבוב ימינה" direction="right" disabled={disabled} style={{ right: 8, top: 8 }} onTurn={onTurn} />
        </div>
      ) : null}
    </div>
  );
}

function imageFrame(image: HTMLImageElement, stage: HTMLElement): Frame | null {
  const imageBox = image.getBoundingClientRect();
  const stageBox = stage.getBoundingClientRect();
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight || !imageBox.width || !imageBox.height) return null;
  const scale = Math.min(imageBox.width / naturalWidth, imageBox.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    x: imageBox.left - stageBox.left + (imageBox.width - width) / 2,
    y: imageBox.top - stageBox.top + (imageBox.height - height) / 2,
    width,
    height,
  };
}

function resizeCrop(crop: CropFractions, handle: Handle, point: { x: number; y: number }, minX: number, minY: number): CropFractions {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;
  const x = clampUnit(point.x);
  const y = clampUnit(point.y);
  if (handle === "w" || handle === "nw" || handle === "sw") left = Math.min(Math.max(0, x), right - minX);
  if (handle === "e" || handle === "ne" || handle === "se") right = Math.max(Math.min(1, x), left + minX);
  if (handle === "n" || handle === "nw" || handle === "ne") top = Math.min(Math.max(0, y), bottom - minY);
  if (handle === "s" || handle === "sw" || handle === "se") bottom = Math.max(Math.min(1, y), top + minY);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function handleStyle(handle: Handle): CSSProperties {
  const corner = handle.length === 2;
  const across = handle === "n" || handle === "s";
  const along = handle === "e" || handle === "w";
  const style: CSSProperties = {
    position: "absolute",
    zIndex: corner ? 2 : 1,
    padding: 0,
    border: 0,
    background: "transparent",
    cursor: cursorFor(handle),
  };
  if (corner) {
    style.width = 28;
    style.height = 28;
    style.transform = "translate(-50%, -50%)";
    if (handle.includes("w")) style.left = 0;
    if (handle.includes("e")) style.right = 0;
    if (handle.includes("n")) style.top = 0;
    if (handle.includes("s")) style.bottom = 0;
    if (handle.includes("e")) style.transform = handle.includes("n") ? "translate(50%, -50%)" : "translate(50%, 50%)";
    if (handle.includes("w") && handle.includes("s")) style.transform = "translate(-50%, 50%)";
    return style;
  }
  if (across) {
    style.left = 18;
    style.right = 18;
    style.height = 28;
    style.top = handle === "n" ? -14 : undefined;
    style.bottom = handle === "s" ? -14 : undefined;
  }
  if (along) {
    style.top = 18;
    style.bottom = 18;
    style.width = 28;
    style.left = handle === "w" ? -14 : undefined;
    style.right = handle === "e" ? -14 : undefined;
  }
  return style;
}

function handleMark(handle: Handle): CSSProperties {
  const corner = handle.length === 2;
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: corner ? 14 : handle === "e" || handle === "w" ? 6 : 28,
    height: corner ? 14 : handle === "n" || handle === "s" ? 6 : 28,
    transform: "translate(-50%, -50%)",
    borderRadius: corner ? 999 : 999,
    background: "#fff",
    boxShadow: "0 0 0 2px var(--teal)",
  };
}

function TurnButton({
  label,
  direction,
  disabled,
  style,
  onTurn,
}: {
  label: string;
  direction: "left" | "right";
  disabled: boolean;
  style: CSSProperties;
  onTurn: (direction: "left" | "right") => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      style={{
        position: "absolute",
        zIndex: 4,
        width: 32,
        height: 32,
        display: "grid",
        placeItems: "center",
        padding: 0,
        border: 0,
        borderRadius: 999,
        background: "rgba(255,255,255,.94)",
        color: "#16342f",
        boxShadow: "0 1px 3px rgba(0,0,0,.35)",
        ...style,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onTurn(direction);
      }}
    >
      <TurnIcon direction={direction} />
    </button>
  );
}

function TurnIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={direction === "left" ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M14.5 7.2A5.6 5.6 0 1 0 16.6 13" strokeLinecap="round" />
      <path d="M14.2 4.2v4h-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function cursorFor(handle: Handle) {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  return "nesw-resize";
}
