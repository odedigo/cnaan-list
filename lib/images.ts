export async function compressImage(file: File) {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("התמונה גדולה מדי");
  }
  const image = await loadImage(file);
  const maxEdge = 300;
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return { blob: file, contentType: file.type || "image/jpeg" };
  context.drawImage(image, 0, 0, width, height);
  const webp = await toBlob(canvas, "image/webp", 0.82);
  if (webp && webp.size > 0 && webp.type === "image/webp") {
    return { blob: webp, contentType: "image/webp" };
  }
  const jpeg = await toBlob(canvas, "image/jpeg", 0.85);
  if (jpeg && jpeg.size > 0) return { blob: jpeg, contentType: "image/jpeg" };
  return { blob: file, contentType: file.type || "image/jpeg" };
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

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}
