import { useState } from "react";
import { Button } from "@/components/ds";

/**
 * Lets a person send CashNear to someone else: a shop owner they know, or a
 * friend. Uses the phone's own share sheet where there is one, and copies the
 * link where there is not. The link only opens the join page.
 */
export function ShareJoinLink({
  audience,
  label,
}: {
  audience: "shop" | "customer";
  label: string;
}) {
  const [note, setNote] = useState<string | null>(null);

  const share = async () => {
    const url = `${window.location.origin}/auth?mode=signup${audience === "shop" ? "&as=shop" : ""}`;
    const text =
      audience === "shop"
        ? "Do you keep cash at your shop? Register your shop with CashNear. It is free."
        : "Get cash from a shop near you. Join CashNear free.";
    setNote(null);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "CashNear", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setNote("Link copied. Paste it in a message.");
    } catch (e) {
      // Closing the share sheet is not a problem.
      if ((e as Error)?.name !== "AbortError") setNote("We could not share it. Please try again.");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" fullWidth onClick={share}>
        {label}
      </Button>
      {note ? (
        <p className="text-[13px] text-muted-foreground" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
