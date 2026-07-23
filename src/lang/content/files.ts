// Content packs as FILES — reading them in and handing them out. The registry
// owns validation and storage; this module owns the browser plumbing shared by
// the contents page and the content-creation page: importing a picked FileList
// (each file validated via importPackJson) and downloading text / a pack back
// out as a file.

import { importPackJson } from "@/lang/content/registry";
import type { ContentPack } from "@/lang/content/schema";

/** Trigger a browser download of `text` as a file named `filename`. */
export function downloadText(
  filename: string,
  text: string,
  type = "application/json",
): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Download a pack as a shareable file, named after its id. */
export function downloadPack(pack: ContentPack): void {
  downloadText(`${pack.id}.json`, JSON.stringify(pack, null, 2));
}

export interface ImportFilesResult {
  /** How many packs were imported successfully. */
  added: number;
  /** One message per failed file, prefixed with its name. */
  errors: string[];
}

/** Read every picked file and import it through the registry's validation.
 *  Resolves once all files have been read (never rejects — failures land in
 *  `errors`). */
export function importPackFiles(files: FileList | File[]): Promise<ImportFilesResult> {
  const list = Array.from(files);
  if (list.length === 0) return Promise.resolve({ added: 0, errors: [] });
  return new Promise((resolve) => {
    const errors: string[] = [];
    let added = 0;
    let remaining = list.length;
    const finish = (): void => {
      if (--remaining === 0) resolve({ added, errors });
    };
    for (const file of list) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = importPackJson(String(reader.result ?? ""));
        if (result.ok) added += 1;
        else errors.push(`${file.name}: ${result.errors.join(" ")}`);
        finish();
      };
      reader.onerror = () => {
        errors.push(`${file.name}: could not read the file.`);
        finish();
      };
      reader.readAsText(file);
    }
  });
}
