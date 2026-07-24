import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { util } from "@platforma-sdk/package-builder-lib";
import { calculateSha256 } from "../util";

/**
 * Compiled kind descriptor shape read off the built bundle. Mirrors the runtime
 * fields `defineBlockKind` bakes into the frozen v1 descriptor
 * (`@platforma-sdk/block-kind`, `src/descriptor.ts`):
 * `{ kindSchema: "v1", name, version }`.
 *
 * `name` is the FULL npm package name; there is no separate `organization`
 * field. The S3 `{org, name}` path is derived from `name` downstream via
 * `npmNameToKindPath`.
 */
interface CompiledKindExport {
  kindSchema?: string;
  name?: string;
  version?: string;
}

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
 * Resolve, load, and read the compiled kind descriptor. The bundle is ESM
 * (rolldown `format: "es"`), so it is loaded via `import()` — a `require()` on a
 * pure-ESM main would throw.
 */
async function readCompiledKind(entryPath: string): Promise<CompiledKindExport> {
  const mod = (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
  // A kind package may name the export or default it; accept both.
  const kind = (mod.kind ?? mod.default ?? mod) as CompiledKindExport;
  return kind;
}

/**
 * Commander-free core: bundle-in, manifest-out. Reads the compiled kind's
 * npm package `name`/`version`, computes one sha256 over the `src/` tree
 * (upper-case), and writes `manifest.json` LAST as the commit marker (the
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

  const entryPath = path.resolve(dst, entryFileName);
  const kind = await readCompiledKind(entryPath);

  const { name, version } = kind;
  if (!name || !version) {
    throw new Error(
      `Compiled kind export is missing name/version ` +
        `(read from ${entryPath}). Got: ${JSON.stringify({ name, version })}.`,
    );
  }

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
