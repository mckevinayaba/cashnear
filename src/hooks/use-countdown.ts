import { useEffect, useState } from "react";
import { secondsLeft } from "@/lib/cash";

/** Whole seconds until `iso`, re-rendering once a second. 0 when there is no deadline or it has passed. */
export function useCountdown(iso: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return secondsLeft(iso, now);
}
