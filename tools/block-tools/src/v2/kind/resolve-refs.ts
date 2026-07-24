import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { formatKindRef, type BlockKindReference } from "@milaboratories/pl-model-common";
import type { BlockPackManifest } from "@milaboratories/pl-model-middle-layer";
import { KindManifest } from "../registry/schema_kinds";
import type { RelativeContentReader } from "../model";

/**
 * Kind → block ref resolution — the SOLE quarantine for the OPEN Q-0004
 * (where does the facade declare its kind dependency?) and part of Q-0005
 * (how the kind package is built / named). Every assumption about the shape
 * or location of a kind dependency that could still flip lives here, so a
 * later reconciliation edits one file, not the gate or the orchestrator.
 */

/** npm package-name suffix marking a package as a block kind (schema_kinds convention). */
const KIND_PACKAGE_SUFFIX = ".kind";

/**
 * The kind reference the MODEL was compiled against, as baked into the block
 * manifest by concern #3.
 *
 * RECONCILIATION vs. doc §4 pseudocode: the doc read
 * `manifest.description.components.model.kindRef`. The shipped record-kind-ref
 * concern instead lifts the model's container-level `kind` to the TOP LEVEL of
 * the description (`description.kind`, a `{name}@{version}` string — see
 * `block_description.ts` and the reconciler read at `registry.ts:301`). We read
 * the field that actually exists. `undefined` ⇒ the block declares no kind.
 */
export function readModelCompiledKindRef(
  manifest: BlockPackManifest,
): BlockKindReference | undefined {
  return manifest.description.kind;
}

/** A kind dependency as declared in the facade's `package.json`. */
export interface FacadeKindDependency {
  /** npm package name of the kind (ends in `.kind`). */
  npmName: string;
  /** Raw version range as written in `package.json` (e.g. `^1.2.3`, `workspace:*`). */
  range: string;
}

/**
 * The facade-side kind dependency, read from the facade's `package.json`.
 *
 * Q-0004 (OPEN): whether the authoritative facade-side kind dep is a DIRECT
 * facade dependency or resolves transitively through `model/package.json` is
 * unsettled — the facade's `dependencies` is empty today (model/ui/workflow sit
 * under `devDependencies`). We scan `dependencies` + `devDependencies` for the
 * single `.kind`-suffixed entry. If Q-0004 flips to the transitive form, this is
 * the one function that changes.
 *
 * Returns `undefined` when no kind dependency is declared.
 */
export function readFacadeKindDependency(facadeDir: string): FacadeKindDependency | undefined {
  const pkgPath = path.join(facadeDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = { ...pkg.devDependencies, ...pkg.dependencies };
  const entry = Object.entries(deps).find(([name]) => name.endsWith(KIND_PACKAGE_SUFFIX));
  if (!entry) return undefined;
  return { npmName: entry[0], range: entry[1] };
}

/**
 * Resolved, publishable kind artifacts: the concrete reference, the kind's
 * content manifest, and a reader rooted at the kind's `dist/` folder.
 */
export interface ResolvedFacadeKind {
  /** Concrete `{name}@{version}` reference of the kind the facade actually ships. */
  ref: BlockKindReference;
  /** The kind content manifest (`build_kind_dist` output) read from the kind's dist. */
  manifest: KindManifest;
  /** Reads the manifest's `files[].name` relative to the kind's `dist/`. */
  fileReader: RelativeContentReader;
}

/**
 * Resolve the facade's kind dependency to concrete publishable artifacts.
 *
 * Resolves the kind npm package from the facade's perspective, reads its
 * built `dist/manifest.json` (the authoritative concrete version — the facade
 * `package.json` range may be `workspace:*`/`catalog:` and carry no concrete
 * version), and returns a `dist/`-rooted file reader for `publishKind`.
 *
 * Q-0004/Q-0005 seam: how the kind package is located and how its dist is laid
 * out are not finalized. This best-effort resolution uses standard node
 * resolution from the facade dir; if the package or its manifest cannot be
 * found it throws with a pointed message rather than silently skipping.
 */
export async function resolveFacadeKind(
  facadeDir: string,
  npmName: string,
): Promise<ResolvedFacadeKind> {
  const kindPkgDir = resolveKindPackageDir(facadeDir, npmName);
  const distDir = path.join(kindPkgDir, "dist");

  let manifestRaw: string;
  try {
    manifestRaw = await fsp.readFile(path.join(distDir, "manifest.json"), "utf-8");
  } catch {
    throw new Error(
      `Kind package "${npmName}" resolved to ${kindPkgDir} but has no dist/manifest.json. ` +
        `Build the kind (ts-builder build --target block-kind && block-tools build-kind-manifest) before publishing.`,
    );
  }
  const manifest = KindManifest.parse(JSON.parse(manifestRaw));

  const ref = formatKindRef({ name: manifest.kind.name, version: manifest.kind.version });
  const fileReader: RelativeContentReader = async (relativePath) =>
    Buffer.from(await fsp.readFile(path.resolve(distDir, relativePath)));

  return { ref, manifest, fileReader };
}

/** Resolve the directory of an installed kind npm package from the facade's location. */
function resolveKindPackageDir(facadeDir: string, npmName: string): string {
  const req = createRequire(path.join(facadeDir, "package.json"));
  // Prefer the package's own package.json (deterministic package root).
  try {
    return path.dirname(req.resolve(`${npmName}/package.json`));
  } catch {
    // Fall back to the package entry point, then walk up to the folder holding package.json.
    try {
      let dir = path.dirname(req.resolve(npmName));
      for (let i = 0; i < 6; i++) {
        if (fs.existsSync(path.join(dir, "package.json"))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    } catch {
      /* fall through to the throw below */
    }
    throw new Error(
      `Cannot resolve kind package "${npmName}" from ${facadeDir}. ` +
        `Ensure it is installed as a dependency of the facade.`,
    );
  }
}
