// Image upload client. Images NEVER go into the CRDT document - the file is
// POSTed to the token server, which streams it into the S3 bucket, and only
// the resulting (same-origin) URL is stored in the shape.

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Returns an error message, or null when the file is uploadable. */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) {
    return "Please choose a PNG, JPEG, WebP or GIF image.";
  }
  if (file.size > MAX_BYTES) {
    return "That image is over 8 MB — please pick a smaller one.";
  }
  return null;
}

export async function uploadImage(file: File): Promise<{ url: string }> {
  const res = await fetch(
    "/api/upload?name=" + encodeURIComponent(file.name),
    {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    },
  );
  if (!res.ok) {
    throw new Error("Upload failed (" + res.status + ")");
  }
  return (await res.json()) as { url: string };
}
