/**
 * The two handshake words. The customer and the shop each see the same pair
 * once a request is held; saying them aloud confirms they're meeting the
 * right person before any money moves.
 */
export function Handshake({ words, hint }: { words: string; hint: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-[40px] leading-none text-gold" data-testid="handshake-words">
        {words}
      </p>
      <p className="mx-auto mt-3 max-w-[28ch] text-[13px] leading-relaxed text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
