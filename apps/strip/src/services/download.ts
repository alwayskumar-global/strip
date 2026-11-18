// Saves the received file with its original name and MIME type through a temporary object URL on an a[download] (R12.14, R12.15).
export function downloadFile(bytes: Uint8Array, name: string, mime: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = doc.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
