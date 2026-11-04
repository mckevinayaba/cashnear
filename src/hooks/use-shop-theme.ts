import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ShopTheme = "day" | "night";

const STORAGE_KEY = "cashnear-shop-theme";
const DAYLIGHT_CLASS = "theme-daylight";

/**
 * The signed-in app opens bright and high-contrast ("daylight"): people use it
 * on the street and at a till, often in strong sun, where a dark screen is hard
 * to read. Anyone can switch to the dark look, and the choice is remembered on
 * the device.
 *
 * One shared value serves every screen, so switching it in Account changes the
 * whole app at once. Reading and switching are separate from putting the class
 * on the page, which is done once, by the app shell.
 */

const listeners = new Set<() => void>();
let current: ShopTheme | null = null;

function readStored(): ShopTheme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "night" ? "night" : "day";
  } catch {
    return "day";
  }
}

function snapshot(): ShopTheme {
  if (current === null) current = readStored();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function set(next: ShopTheme) {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* a remembered preference is a nicety */
  }
  listeners.forEach((l) => l());
}

/** Reads the shared choice and lets a screen switch it. Does not touch the page itself. */
export function useShopTheme(): [ShopTheme, () => void] {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "day" as ShopTheme);
  const toggle = useCallback(() => set(snapshot() === "day" ? "night" : "day"), []);
  return [theme, toggle];
}

/**
 * Puts the daylight class on the document root, so the page background and
 * overscroll area follow it, and takes it off again when the app is left, so the
 * public pages keep their own look. Used once, by the app shell.
 */
export function useApplyTheme(): void {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "day" as ShopTheme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(DAYLIGHT_CLASS, theme === "day");
    return () => root.classList.remove(DAYLIGHT_CLASS);
  }, [theme]);
}
