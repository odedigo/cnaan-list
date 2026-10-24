import { zipStore } from "@/lib/zip";

export function zipStoreAsync(files: { name: string; data: Uint8Array<ArrayBuffer> }[]) {
  if (typeof Worker === "undefined") return Promise.resolve(zipStore(files));
  let worker: Worker;
  try {
    worker = new Worker(new URL("./zip-worker.ts", import.meta.url), { type: "module" });
  } catch {
    return Promise.resolve(zipStore(files));
  }
  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      worker.terminate();
      resolve(new Uint8Array(event.data));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("zip"));
    };
    worker.postMessage(
      { files },
      files.map((file) => file.data.buffer),
    );
  });
}
