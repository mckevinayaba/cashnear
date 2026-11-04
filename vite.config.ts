// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// No production fallback here, ever: never hardcode a Supabase URL/key.
// VITE_* values are injected by @lovable.dev/vite-tanstack-config. The managed
// build wraps this config and supplies env after config load, so a missing var
// here must only WARN — throwing at config-load time breaks managed builds.
// The Supabase client itself still fails loudly at runtime if values are absent.
const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const missingVars = [
  ...(!(env.VITE_SUPABASE_URL ?? env.SUPABASE_URL) ? ["VITE_SUPABASE_URL"] : []),
  ...(!(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY)
    ? ["VITE_SUPABASE_PUBLISHABLE_KEY"]
    : []),
];
if (missingVars.length > 0) {
  console.warn(
    `[cashnear] Supabase env not visible at config load: ${missingVars.join(", ")}. ` +
      "Expecting the build environment to inject them; see .env.example.",
  );
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
