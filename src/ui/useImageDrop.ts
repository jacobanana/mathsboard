// Drag-and-drop image insert.
//
// Dropping an image file anywhere on the board uploads it through the SAME
// backend path as the Picture dialog (src/collab/upload.ts -> /api/upload) and
// places it at the drop point. Because it needs that backend, the caller only
// wires the returned handlers up in collaborative builds (see src/config.ts) —
// the static single-user build neither registers the image tool nor drops here.
//
// The hook itself is UI-only: it validates + probes + uploads the file, then
// hands the finished image (url + intrinsic size) and the drop point back to
// the host's placement code via `place`.

import { useCallback, useRef, useState } from "react";
import type React from "react";
import { uploadImage, validateImageFile } from "@/collab/upload";

/** A finished, uploaded image ready to place (mirrors ImageParams). */
export interface DroppedImage {
  url: string;
  /** Intrinsic bitmap size in px (natural width/height). */
  natW: number;
  natH: number;
}

export interface ImageDropHandlers {
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
}

export interface UseImageDrop {
  /** True while an image file is dragged over the drop target (for a hint). */
  active: boolean;
  /** Transient validation / upload error to surface, or null. */
  error: string | null;
  /** Spread onto the drop-target element. */
  handlers: ImageDropHandlers;
}

/** How long a drop error toast stays up. */
const ERROR_MS = 2600;

/**
 * @param place called once the dropped file is uploaded — with the finished
 *   image and the drop point in target-relative screen px (e.g. offset from
 *   #stage's top-left), so the host can place it exactly under the cursor.
 */
export function useImageDrop(
  place: (image: DroppedImage, at: { x: number; y: number }) => void,
): UseImageDrop {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashError = useCallback((msg: string) => {
    setError(msg);
    if (errTimer.current) clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setError(null), ERROR_MS);
  }, []);

  /** A drag carrying files (not an internal element/text drag). */
  const isFileDrag = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.types).includes("Files");

  const onDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!isFileDrag(e)) return;
    // Both preventDefaults are REQUIRED to make this a valid drop target and to
    // stop the browser navigating away to open the dropped file.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    // dragleave also fires when crossing INTO a child; ignore those and only
    // clear the hint when the pointer actually leaves the drop target.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setActive(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setActive(false);

      const file = Array.from(e.dataTransfer.files).find((f) =>
        f.type.startsWith("image/"),
      );
      if (!file) {
        flashError("Drop an image file (PNG, JPEG, WebP or GIF).");
        return;
      }
      const problem = validateImageFile(file);
      if (problem) {
        flashError(problem);
        return;
      }

      // Capture the drop point NOW (the event is pooled/reused after this tick).
      const rect = e.currentTarget.getBoundingClientRect();
      const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      // Probe the intrinsic size (for aspect ratio), then upload + place.
      const objectUrl = URL.createObjectURL(file);
      const probe = new Image();
      probe.onload = () => {
        const natW = probe.naturalWidth || 1;
        const natH = probe.naturalHeight || 1;
        URL.revokeObjectURL(objectUrl);
        void uploadImage(file)
          .then(({ url }) => place({ url, natW, natH }, at))
          .catch(() =>
            flashError("Upload failed — check the connection and try again."),
          );
      };
      probe.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        flashError("That file doesn't look like a readable image.");
      };
      probe.src = objectUrl;
    },
    [flashError, place],
  );

  return { active, error, handlers: { onDragOver, onDragLeave, onDrop } };
}
