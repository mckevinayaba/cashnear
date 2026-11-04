import { supabase } from "@/integrations/supabase/client";
import { fitWithin } from "@/lib/cash";

/**
 * Shop front photos. A person from CashNear takes the photo when they visit
 * the shop and adds it here. Customers only ever look at it.
 */

export const SHOPFRONT_BUCKET = "shopfronts";
const LONGEST_SIDE = 1280;
const MAX_BYTES = 3 * 1024 * 1024;

export function shopfrontUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(SHOPFRONT_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Shrinks a phone photo to a size that loads quickly on a weak signal. Drawing
 * it onto a fresh canvas also drops everything hidden inside the original file,
 * including the place where it was taken.
 */
export async function prepareShopfrontImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("We could not read that photo. Try another.");
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, LONGEST_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("We could not read that photo. Try another.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob) throw new Error("We could not read that photo. Try another.");
  if (blob.size > MAX_BYTES) throw new Error("That photo is too big. Try another.");
  return blob;
}

/** Uploads a prepared photo into the shop's own folder and returns its path. */
export async function uploadShopfront(businessId: string, file: File): Promise<string> {
  const blob = await prepareShopfrontImage(file);
  const path = `${businessId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(SHOPFRONT_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) throw new Error("We could not upload the photo. Please try again.");
  return path;
}

/** Tidies up a photo that has been replaced. Failing to is not worth bothering anyone about. */
export async function removeShopfrontFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage
    .from(SHOPFRONT_BUCKET)
    .remove([path])
    .catch(() => undefined);
}
