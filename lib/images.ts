export async function compressImage(file: File) {
  return shrinkImage(file, 300, 0.82);
}

export type NormBox = { ymin: number; xmin: number; ymax: number; xmax: number };

export type CropFractions = { x: number; y: number; width: number; height: number };

/** Crop a photo to a fraction of its frame. A full-frame selection returns the original file. */
export async function cropImageFile(file: File, crop: CropFractions) {
  const image = await loadImage(file);
  const left = clamp01(crop.x);
  const top = clamp01(crop.y);
  const width = clamp01(Math.min(crop.width, 1 - left));
  const height = clamp01(Math.min(crop.height, 1 - top));
  const x = Math.round(left * image.width);
  const y = Math.round(top * image.height);
  const frameWidth = Math.min(image.width - x, Math.max(1, Math.round(width * image.width)));
  const frameHeight = Math.min(image.height - y, Math.max(1, Math.round(height * image.height)));
  if (x === 0 && y === 0 && frameWidth === image.width && frameHeight === image.height) return file;
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("לא ניתן לקרוא את התמונה");
  context.drawImage(image, x, y, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92));
  if (!blob) throw new Error("לא ניתן לקרוא את התמונה");
  return new File([blob], "recipe.jpg", { type: "image/jpeg" });
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Turn a crop rectangle with the picture. `right` is 90 degrees clockwise. */
export function rotateCrop(crop: CropFractions, direction: "left" | "right"): CropFractions {
  if (direction === "right") {
    return { x: 1 - (crop.y + crop.height), y: crop.x, width: crop.height, height: crop.width };
  }
  return { x: crop.y, y: 1 - (crop.x + crop.width), width: crop.height, height: crop.width };
}

/** Rotate a photo by 90-degree steps. Zero steps returns the original file. */
export async function rotateImageFile(file: File, clockwiseQuarters: number) {
  const turns = ((clockwiseQuarters % 4) + 4) % 4;
  if (turns === 0) return file;
  const image = await loadImage(file);
  const swap = turns % 2 === 1;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? image.height : image.width;
  canvas.height = swap ? image.width : image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("לא ניתן לסובב את התמונה");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turns * Math.PI) / 2);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92));
  if (!blob) throw new Error("לא ניתן לסובב את התמונה");
  return new File([blob], "recipe.jpg", { type: "image/jpeg" });
}

/** True when the box is a dish region inside the picture, not the whole frame. */
export function separateDishBox(box: NormBox) {
  const top = clamp(Math.min(box.ymin, box.ymax));
  const bottom = clamp(Math.max(box.ymin, box.ymax));
  const left = clamp(Math.min(box.xmin, box.xmax));
  const right = clamp(Math.max(box.xmin, box.xmax));
  if (bottom - top < 80 || right - left < 80) return false;
  if (bottom - top > 920 && right - left > 920) return false;
  return true;
}

/** Crop a dish photo out of a recipe picture. Coordinates are 0–1000. A nearly full frame keeps the whole picture. */
export async function dishPhotoFile(file: File, box: NormBox) {
  const image = await loadImage(file);
  const frame = pixelBox(image, box);
  if (!frame) return null;
  if (frame.x === 0 && frame.y === 0 && frame.width === image.width && frame.height === image.height) return shrinkImage(file, 1280, 0.75);
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/jpeg", 0.86));
  if (!blob) return null;
  return shrinkImage(new File([blob], "dish.jpg", { type: "image/jpeg" }), 1280, 0.75);
}

function pixelBox(image: HTMLImageElement, box: NormBox) {
  const top = clamp(Math.min(box.ymin, box.ymax));
  const bottom = clamp(Math.max(box.ymin, box.ymax));
  const left = clamp(Math.min(box.xmin, box.xmax));
  const right = clamp(Math.max(box.xmin, box.xmax));
  if (bottom - top < 80 || right - left < 80) return null;
  if (bottom - top > 920 && right - left > 920) return { x: 0, y: 0, width: image.width, height: image.height };
  const x = Math.round((left / 1000) * image.width);
  const y = Math.round((top / 1000) * image.height);
  const width = Math.min(image.width - x, Math.max(1, Math.round(((right - left) / 1000) * image.width)));
  const height = Math.min(image.height - y, Math.max(1, Math.round(((bottom - top) / 1000) * image.height)));
  if (width < 64 || height < 64) return null;
  return { x, y, width, height };
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1000, Math.max(0, value));
}

export async function shrinkImage(file: File, maxEdge: number, quality: number) {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("התמונה גדולה מדי");
  }
  const image = await loadImage(file);
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("לא ניתן לכווץ את התמונה");
  context.drawImage(image, 0, 0, width, height);
  const webp = await encode(canvas, "image/webp", quality);
  const jpeg = await encode(canvas, "image/jpeg", Math.min(0.86, quality + 0.08));
  const encoded = [webp, jpeg].filter((item): item is EncodedImage => item != null).sort((a, b) => a.blob.size - b.blob.size)[0];
  if (!encoded) throw new Error("לא ניתן לכווץ את התמונה");
  return { ...encoded, width, height };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("לא ניתן לקרוא את התמונה"));
    };
    image.src = url;
  });
}

type EncodedImage = { blob: Blob; contentType: "image/webp" | "image/jpeg" };

function encode(canvas: HTMLCanvasElement, type: EncodedImage["contentType"], quality: number) {
  return new Promise<EncodedImage | null>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) {
        resolve(null);
        return;
      }
      if (blob.type && blob.type !== type) {
        resolve(null);
        return;
      }
      resolve({ blob, contentType: type });
    }, type, quality);
  });
}
