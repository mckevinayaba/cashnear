// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// The root .env is git-ignored in this repo, so published builds never see it.
// cloud.public.json (committed) holds ONLY the public backend URL + publishable
// key for this project's single Lovable Cloud backend. It is used only for vars
// that are missing; real env always wins. Never put private keys in that file.
// A missing var still only WARNS here — throwing at config load breaks builds.
const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const publicCfgPath = resolve(process.cwd(), "cloud.public.json");
const publicCfg: Record<string, string> = existsSync(publicCfgPath)
  ? JSON.parse(readFileSync(publicCfgPath, "utf8"))
  : {};

const KEYS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PROJECT_ID"];
const define: Record<string, string> = {};
const missingVars: string[] = [];
for (const key of KEYS) {
  const value = env[key] || env[key.replace(/^VITE_/, "")] || publicCfg[key];
  if (!value) {
    missingVars.push(key);
    continue;
  }
  if (!env[key]) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
    process.env[key] ??= value;
    process.env[key.replace(/^VITE_/, "")] ??= value;
  }
}
if (missingVars.length > 0) {
  console.warn(
    `[cashnear] Backend env not visible at config load: ${missingVars.join(", ")}. ` +
      "Expecting the build environment to inject them; see .env.example.",
  );
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: { define },
});
