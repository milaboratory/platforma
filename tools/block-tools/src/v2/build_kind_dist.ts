import fsp from "node:fs/promises";
import path from "node:path";
import { util } from "@platforma-sdk/package-builder-lib";
import { calculateSha256 } from "../util";

export interface BuildKindDistOptions {
  /** Kind package directory (the dir containing `package.json`, `src/`, `dist/`). */
  modulePath?: string;
  /** Source directory hashed into `sourceHash`, relative to `modulePath`. */
  srcDir?: string;
  /** Output directory holding the compiled bundle and receiving `manifest.json`. */
  dst?: string;
  /** Compiled entry file name inside `dst` (rolldown emits `kind.js`). */
  entryFileName?: string;
}

// The on-wire kind manifest shape (identity, per-file info, and the manifest
// itself) is owned by the registry schema module — the single source of truth
// shared by the build side (this producer) and the registry read/write path.
export type {
  KindManifest,
  KindManifestIdentity,
  KindManifestFileInfo,
} from "./registry/schema_kinds";
import type { KindManifest, KindManifestFileInfo } from "./registry/schema_kinds";

export const KindManifestFile = "manifest.json";

/**
 * Read the kind's identity from its own `package.json` — the SINGLE source of
 * truth. The block-kind build bakes the SAME `{name, version}` into the emitted
 * bundle (via `define`), so the manifest identity here and the runtime
 * descriptor's identity are guaranteed to agree. Reading package.json directly
 * (rather than importing the ESM bundle) keeps this authoritative and free of a
 * dynamic-import dependency on the compiled output.
 */
async function readKindPackageIdentity(
  modulePath: string,
): Promise<{ name: string; version: string }> {
  const pkgPath = path.resolve(modulePath, "package.json");
  let raw: string;
  try {
    raw = await fsp.readFile(pkgPath, "utf-8");
  } catch {
    throw new Error(`Cannot read kind package.json at ${pkgPath}.`);
  }
  const pkg = JSON.parse(raw) as { name?: unknown; version?: unknown };
  if (typeof pkg.name !== "string" || typeof pkg.version !== "string") {
    throw new Error(`Kind package.json at ${pkgPath} must declare string "name" and "version".`);
  }
  return { name: pkg.name, version: pkg.version };
}

/**
 * Commander-free core: bundle-in, manifest-out. Reads the kind's npm package
 * `name`/`version` from its `package.json`, computes one sha256 over the `src/`
 * tree (upper-case), and writes `manifest.json` LAST as the commit marker (the
 * build_dist.ts convention: readers treat the manifest's presence as "the dist
 * is complete").
 *
 * Shaped commander-free so the deferred publish-time source-hash guard can
 * `import` and reuse both the hash computation and this manifest shape without
 * CLI coupling.
 */
export async function buildKindDist(opts: BuildKindDistOptions = {}): Promise<KindManifest> {
  const modulePath = path.resolve(opts.modulePath ?? ".");
  const srcDir = path.resolve(modulePath, opts.srcDir ?? "src");
  const dst = path.resolve(modulePath, opts.dst ?? "dist");
  const entryFileName = opts.entryFileName ?? "kind.js";

  const { name, version } = await readKindPackageIdentity(modulePath);

  // One sha256 over the sorted src/ tree. `hashDirSync` digests lower-case;
  // `.toUpperCase()` matches block-tools' `calculateSha256` (util.ts) so the
  // future publish-side comparator never fails on a case mismatch.
  const sourceHash = util.hashDirSync(srcDir).digest("hex").toUpperCase();

  // Per-artifact hashes of the emitted bundle, mirroring build_dist.ts's file
  // list. Missing artifacts are skipped fail-safe (e.g. no sourcemap).
  const artifactNames = [entryFileName, "kind.d.ts"];
  const files: KindManifestFileInfo[] = [];
  for (const artifact of artifactNames) {
    const abs = path.resolve(dst, artifact);
    try {
      const bytes = await fsp.readFile(abs);
      files.push({ name: artifact, size: bytes.length, sha256: await calculateSha256(bytes) });
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") continue;
      throw err;
    }
  }

  const manifest: KindManifest = {
    schema: "v1",
    kind: { name, version },
    sourceHash,
    files,
    timestamp: Date.now(),
  };

  // manifest.json written LAST — commit marker.
  await fsp.writeFile(path.resolve(dst, KindManifestFile), JSON.stringify(manifest));
  return manifest;
}
