import { useState } from "react";
import { shopfrontUrl } from "@/lib/shopfront";
import { cn } from "@/lib/utils";

/**
 * The front of the shop, so a customer can see what they are walking to.
 * Shows nothing at all when there is no photo or it fails to load, so a missing
 * picture never looks like a broken page.
 */
export function ShopfrontPhoto({
  path,
  name,
  className,
}: {
  path: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = shopfrontUrl(path);
  if (!url || failed) return null;
  return (
    <img
      src={url}
      alt={`The front of ${name}`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("aspect-[16/9] w-full rounded-2xl bg-surface-2 object-cover", className)}
    />
  );
}
