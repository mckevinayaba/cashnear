// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// No production fallback here, ever. A previous incident workaround
// hardcoded a literal production Supabase URL/anon key as fallback
// values -- meaning a staging/preview build with a missing env var would
// silently connect to production instead of failing. Missing required
// vars must fail loudly at config-load time (dev server start / build),
// not resolve to someone else's environment. See .env.example for the
// variables each deployment must set explicitly.
//
// Read through Vite's own loadEnv (which reads .env/.env.local from this
// directory, real process.env values always taking priority) rather than
// process.env directly -- a bare `vite dev`/`vite build` invocation does
// not otherwise see this project's .env.local at all, since nothing else
// loads it into the process before Vite's own config resolution runs.
const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const supabaseUrl = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;

const missingVars = [
  ...(!supabaseUrl ? ["VITE_SUPABASE_URL (or SUPABASE_URL)"] : []),
  ...(!supabasePublishableKey
    ? ["VITE_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_PUBLISHABLE_KEY)"]
    : []),
];
if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missingVars.join(", ")}. ` +
      "Each environment (local dev, preview, staging, production) must set these explicitly -- " +
      "there is no shared fallback project. Copy .env.example to .env and fill in this " +
      "environment's own Supabase project values.",
  );
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
    },
  },
});
