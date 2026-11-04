import { useCallback, useEffect, useState } from "react";

/**
 * Putting CashNear on the home screen. Android's browser offers a one-tap
 * install, which we hold on to until the person asks for it. iPhones have no
 * such button, so for them we explain the two taps. Everyone else gets the
 * plain steps.
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "cashnear-install-dismissed";
const QUIET_DAYS = 14;

export function isStandaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY));
    return at > 0 && Date.now() - at < QUIET_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(true); // stay hidden until we have checked
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneNow());
    setIos(isIosDevice());
    setDismissed(recentlyDismissed());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") setStandalone(true);
    setEvent(null);
  }, [event]);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* not remembering is fine */
    }
    setDismissed(true);
  }, []);

  return { canPrompt: event !== null, standalone, dismissed, ios, install, dismiss };
}
