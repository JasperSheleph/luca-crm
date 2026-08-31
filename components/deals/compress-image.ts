/**
 * Shrink a camera photo before it leaves the phone.
 *
 * A current handset produces a 3–5 MB frame and the visit-photos bucket caps at
 * 2 MB, so an untouched upload fails on the rep's own device — and on a site
 * with one bar of 4G, sending 4 MB is a minute of standing still. The target is
 * roughly 300 KB, which is plenty to show a lift shaft.
 *
 * Browser-only: canvas and createImageBitmap. Imported by client components.
 */

const MAX_EDGE = 1600;
const TARGET_BYTES = 320 * 1024;
/** Stops before quality gets ugly; a stubborn photo is better big than unreadable. */
const QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5, 0.4];

export async function compressImage(file: File): Promise<File> {
  // Anything not an image — someone picking a PDF from the file browser —
  // passes through untouched and is refused server-side if it is too big.
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // An unsupported format (HEIC on some Androids) still uploads as-is.
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of QUALITY_STEPS) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) break;
    if (blob.size <= TARGET_BYTES || quality === QUALITY_STEPS[QUALITY_STEPS.length - 1]) {
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  }
  return file;
}
