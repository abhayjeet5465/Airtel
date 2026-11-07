/** Bundles the API into one ESM file for Vercel, so the runtime never has to resolve our `.ts` import paths. */
import { build } from "esbuild";

await build({
  entryPoints: ["server/vercel.ts"],
  // One function; vercel.json rewrites every /api/* path to it (catch-all filenames only matched one segment).
  outfile: "api/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  // Some CommonJS dependencies call require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
console.log("built api/index.js");
