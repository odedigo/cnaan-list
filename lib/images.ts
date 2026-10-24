export async function compressImage(file: File) {
  return shrinkImage(file, 300, 0.82);
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
