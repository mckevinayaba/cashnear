import { useCallback, useEffect, useState } from "react";

export type ShopTheme = "day" | "night";

const STORAGE_KEY = "cashnear-shop-theme";
const DAYLIGHT_CLASS = "theme-daylight";

function readStored(): ShopTheme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "night" ? "night" : "day";
  } catch {
    return "day";
  }
}

/**
 * Shop screens default to a bright, high-contrast "daylight" theme: a till is
 * often next to a window or outdoors, where a dark screen is hard to read.
 * The choice is remembered on the device. The class goes on the document root
 * so the page background and overscroll area follow it, and is removed again
 * when the shop leaves, so customer and admin screens keep their own look.
 */
export function useShopTheme(): [ShopTheme, () => void] {
  const [theme, setTheme] = useState<ShopTheme>(() =>
    typeof window === "undefined" ? "day" : readStored(),
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(DAYLIGHT_CLASS, theme === "day");
    return () => root.classList.remove(DAYLIGHT_CLASS);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: ShopTheme = current === "day" ? "night" : "day";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* a remembered preference is a nicety */
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
