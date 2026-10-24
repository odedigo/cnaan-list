import { zipStore } from "@/lib/zip";

type ZipScope = {
  onmessage: ((event: MessageEvent<{ files: { name: string; data: Uint8Array<ArrayBuffer> }[] }>) => void) | null;
  postMessage: (message: ArrayBuffer, transfer: Transferable[]) => void;
};

const scope = self as unknown as ZipScope;

scope.onmessage = (event) => {
  const zip = zipStore(event.data.files);
  scope.postMessage(zip.buffer, [zip.buffer]);
};
