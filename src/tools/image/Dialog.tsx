// Image tool dialog: pick a file, preview it, upload on submit.
//
// The upload happens HERE (not in draw/placement) so the shape that reaches
// the board already carries its final S3-backed URL. EDIT mode shows the
// current picture and lets the user swap the file; submitting without picking
// a new file keeps the existing one.

import { useEffect, useRef, useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { ImageParams } from "@/tools/image";
import { uploadImage, validateImageFile } from "@/collab/upload";

interface Picked {
  file: File;
  objectUrl: string;
  natW: number;
  natH: number;
}

export function ImageDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<ImageParams>): JSX.Element {
  const editing = initial != null;
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pickedRef = useRef<Picked | null>(null);
  pickedRef.current = picked;

  // Revoke the preview object URL when it is replaced / on unmount.
  useEffect(
    () => () => {
      if (pickedRef.current) URL.revokeObjectURL(pickedRef.current.objectUrl);
    },
    [],
  );

  const onFile = (file: File | undefined): void => {
    setErr("");
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      setErr(problem);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      setPicked((prev) => {
        if (prev) URL.revokeObjectURL(prev.objectUrl);
        return {
          file,
          objectUrl,
          natW: probe.naturalWidth || 1,
          natH: probe.naturalHeight || 1,
        };
      });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setErr("That file doesn't look like a readable image.");
    };
    probe.src = objectUrl;
  };

  const submit = async (): Promise<void> => {
    if (busy) return;
    if (!picked) {
      // EDIT without a new file: keep the current picture.
      if (editing && initial.url) {
        onSubmit(initial);
        return;
      }
      setErr("Choose an image first.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const { url } = await uploadImage(picked.file);
      onSubmit({ url, natW: picked.natW, natH: picked.natH });
    } catch {
      setErr("Upload failed — check the connection and try again.");
      setBusy(false);
    }
  };

  const previewUrl = picked?.objectUrl ?? (editing ? initial.url : "");

  return (
    <>
      <h2>{editing ? "Picture" : "Add a picture"}</h2>
      <p className="hint">
        PNG, JPEG, WebP or GIF up to 8 MB. The picture is uploaded and shared
        with everyone on the board.
      </p>

      <label className="img-pick">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {picked ? picked.file.name : "Choose an image…"}
      </label>

      {previewUrl && (
        <img className="img-preview" src={previewUrl} alt="preview" />
      )}

      <p className="err">{err}</p>

      <div className="card-actions">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={busy || (!picked && !editing)}
          onClick={() => void submit()}
        >
          {busy ? "Uploading…" : editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
