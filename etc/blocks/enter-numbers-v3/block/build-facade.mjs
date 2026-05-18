// Scratch facade-bundle build for the slim-facade spike.
// Runs both bundlers side-by-side. Output is for inspection only.
//
//   pnpm build:facade
//
// Produces:
//   dist-dbg/index.d.ts   — dts-bundle-generator output
//   dist-rdp/index.d.ts   — rolldown-plugin-dts output
//
// Both bundlers configured to fully inline @platforma-sdk/model and the
// sibling model package so the facade is self-contained.

import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDtsBundle } from "dts-bundle-generator";
import { rolldown } from "rolldown";
import { dts } from "rolldown-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));

const entryTs = resolve(__dirname, "src/index.ts");
const tsconfigPath = resolve(__dirname, "tsconfig.json");

const modelPkgName = Object.keys(pkg.dependencies ?? {}).find((n) => n.endsWith(".model"));
if (!modelPkgName) throw new Error("Could not find sibling .model package in dependencies.");

const inlineList = ["@platforma-sdk/model", modelPkgName];

console.log(`Facade source:  ${entryTs}`);
console.log(`Inlining:       ${inlineList.join(", ")}`);

// ---------------------------------------------------------------------------
// dts-bundle-generator
// ---------------------------------------------------------------------------
{
  const outDir = resolve(__dirname, "dist-dbg");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const t0 = Date.now();
  const [content] = generateDtsBundle(
    [
      {
        filePath: entryTs,
        libraries: { inlinedLibraries: inlineList },
        output: { sortNodes: false, noBanner: false },
      },
    ],
    { preferredConfigPath: tsconfigPath, followSymlinks: true },
  );
  writeFileSync(resolve(outDir, "index.d.ts"), content);
  console.log(`dts-bundle-generator   → dist-dbg/index.d.ts   (${Date.now() - t0} ms, ${content.length} bytes)`);
}

// ---------------------------------------------------------------------------
// rolldown-plugin-dts
// ---------------------------------------------------------------------------
{
  const outDir = resolve(__dirname, "dist-rdp");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const t0 = Date.now();
  const bundle = await rolldown({
    input: entryTs,
    // Force every package to be resolved and pulled into the bundle so the
    // facade is self-contained. Default Rolldown behavior would keep
    // non-relative imports external.
    external: () => false,
    plugins: [
      dts({
        tsconfig: tsconfigPath,
        emitDtsOnly: true,
        sourcemap: false,
      }),
    ],
  });
  await bundle.write({ dir: outDir, format: "es" });
  await bundle.close();
  const out = readFileSync(resolve(outDir, "index.d.ts"), "utf-8");
  console.log(`rolldown-plugin-dts    → dist-rdp/index.d.ts   (${Date.now() - t0} ms, ${out.length} bytes)`);
}
