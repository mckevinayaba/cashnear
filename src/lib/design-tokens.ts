/**
 * CashNear — Design tokens (TypeScript mirror)
 * Use these constants when you need token values in TS (charts, canvas, etc.).
 * For styling, prefer Tailwind utility classes bound to CSS variables in styles.css.
 */

export const brand = {
  name: "CashNear",
  tagline: "Neighbourhood financial access",
} as const;

export const palette = {
  navy: {
    950: "oklch(0.16 0.03 260)",
    900: "oklch(0.19 0.035 260)",
    800: "oklch(0.235 0.04 260)",
    700: "oklch(0.29 0.045 260)",
  },
  ivory: "oklch(0.965 0.012 85)",
  gold: "oklch(0.78 0.14 85)",
  emerald: "oklch(0.68 0.13 158)",
} as const;

export const radii = {
  sm: "0.625rem",
  md: "0.875rem",
  lg: "1rem",
  xl: "1.5rem",
  "2xl": "2rem",
} as const;

export const spacing = {
  gutter: "1.25rem",
  screenPaddingX: "1.25rem",
  sectionY: "1.5rem",
} as const;

export const motion = {
  ease: [0.2, 0.7, 0.2, 1] as const,
  fast: 180,
  base: 260,
  slow: 420,
} as const;
