import { BlockPackId, SemVer, Sha256Schema } from "@milaboratories/pl-model-middle-layer";
// @todo: don't use zod
import { z } from "zod";
import { parsePackageName } from "../source_package";

/**
 * Registry tree for block *kinds*, a sibling of {@link MainPrefix} (`v2/`).
 *
 * Layout mirrors the package tree one level down:
 *   kinds/{org}/{name}/{version}/manifest.json   — immutable kind content (publishKind)
 *   kinds/{org}/{name}/{version}/kind.d.ts        — kind artifacts
 *   kinds/{org}/{name}/overview.json              — projection over implementing blocks (reconciler)
 */
export const KindsPrefix = "kinds/";

export const KindOverviewFileName = "overview.json";
export const KindManifestFileName = "manifest.json";

/** Location of a kind inside the `kinds/` tree, split into path segments. */
export interface KindPathLocation {
  org: string;
  name: string;
}

/**
 * `kinds/{org}/{name}/{version}` — the immutable per-version content folder,
 * counterpart of {@link packageContentPrefix}.
 *
 * The `{org, name}` segments are DERIVED from the kind's full npm package name
 * via {@link npmNameToKindPath} — the SAME helper {@link kindOverviewPath} and
 * the reconciler use. This is what guarantees a kind's per-version content and
 * its `overview.json` projection land under one identical `{org}/{name}` folder.
 */
export function kindContentPrefix(npmName: string, version: string): string {
  const { org, name } = npmNameToKindPath(npmName);
  return `${KindsPrefix}${org}/${name}/${version}`;
}

/**
 * `kinds/{org}/{name}/overview.json` — the reconciler-maintained projection of
 * every block that implements this kind, bucketed by kind version.
 */
export function kindOverviewPath(loc: KindPathLocation): string {
  return `${KindsPrefix}${loc.org}/${loc.name}/${KindOverviewFileName}`;
}

/**
 * Matches a `kinds/`-relative overview path (`{org}/{name}/overview.json`).
 * Used by the force-mode orphan seed to enumerate every existing overview.
 */
export const KindOverviewPathPattern = new RegExp(
  `^(?<org>[^/]+)/(?<name>[^/]+)/${KindOverviewFileName.replace(".", "\\.")}$`,
);

/**
 * Kind npm package name → `{org, name}` path segments.
 *
 * DELEGATES to {@link parsePackageName} — the canonical block npm-name parser
 * (`source_package.ts`) — so kind registry paths (`kinds/{org}/{name}/…`) mirror
 * block paths (`v2/{org}/{name}/…`) byte-for-byte and cannot drift. That parser
 * drops the npm scope (`@platforma-open/`), takes the 1st dotted segment as the
 * organization and the 2nd as the name, and ignores any trailing segment (the
 * kind's `.kind` marker simply is not matched):
 *   - `@platforma-open/milaboratories.mixcr-clonotyping.kind` → `{ org: "milaboratories", name: "mixcr-clonotyping" }`
 *   - `milaboratories.mixcr-clonotyping.kind`                 → `{ org: "milaboratories", name: "mixcr-clonotyping" }`
 *
 * This helper is DISTINCT from `parseKindRef` (the `{name}@{version}` reference
 * codec in `block_kind_ref.ts`): `parseKindRef` splits a reference into
 * name/version; `npmNameToKindPath` splits the *name* half into path segments.
 */
export function npmNameToKindPath(npmName: string): KindPathLocation {
  const { organization, name } = parsePackageName(npmName);
  return { org: organization, name };
}

/**
 * On-wire kind identity, mirroring the `kind` block written by the build side
 * (`build_kind_dist.ts` `KindManifestIdentity`).
 *
 * `name` is the FULL npm package name of the kind (e.g.
 * `@platforma-open/milaboratories.mixcr-clonotyping.kind`). There is no separate
 * `organization` field — the S3 `{org, name}` path is always derived from this
 * npm name via {@link npmNameToKindPath}, so the content publisher and the
 * overview reconciler resolve to the same folder.
 */
export const KindManifestIdentity = z
  .object({
    name: z.string(),
    version: SemVer,
  })
  .passthrough();
export type KindManifestIdentity = z.infer<typeof KindManifestIdentity>;

export const KindManifestFileInfo = z
  .object({
    name: z.string(),
    size: z.number(),
    sha256: Sha256Schema,
  })
  .passthrough();
export type KindManifestFileInfo = z.infer<typeof KindManifestFileInfo>;

/**
 * Kind content manifest, as produced by `build_kind_dist.ts` and stored (LAST,
 * as the commit marker) at `kinds/{org}/{name}/{version}/manifest.json`.
 *
 * `sourceHash` is the sorted-`src/`-tree digest computed at build time (NOT the
 * per-file `calculateSha256`); it is the comparand for the publish-time
 * source-hash immutability guard. `firstUploadTimestamp` is stamped by
 * `publishKind` when the manifest is first written to the registry.
 */
export const KindManifest = z
  .object({
    schema: z.literal("v1"),
    kind: KindManifestIdentity,
    sourceHash: z.string(),
    files: z.array(KindManifestFileInfo),
    /** Build-time timestamp carried from `build_kind_dist.ts`. */
    timestamp: z.number().optional(),
    /** Stamped by `publishKind` on first upload to the registry. */
    firstUploadTimestamp: z.number().optional(),
  })
  .passthrough();
export type KindManifest = z.infer<typeof KindManifest>;

/**
 * One implementing block version for some kind version. Flat and
 * RMW-friendly: the reconciler filters this list by `(id)` to drop stale
 * entries before re-adding fresh ones.
 */
export const KindImplementer = z
  .object({
    /** Full id of the implementing block, incl. its version. */
    id: BlockPackId,
    /** Kind version this block implements. */
    kindVersion: SemVer,
    /** Channels the block version is published to. */
    channels: z.array(z.string()).default(() => []),
  })
  .passthrough();
export type KindImplementer = z.infer<typeof KindImplementer>;

/**
 * Per-kind-version projection: the newest implementing block per channel,
 * including the derived `any` channel. Mirrors the package overview's
 * `latestByChannel` + `AnyChannel` computation.
 */
export const KindVersionOverview = z
  .object({
    kindVersion: SemVer,
    latestByChannel: z.record(z.string(), BlockPackId),
  })
  .passthrough();
export type KindVersionOverview = z.infer<typeof KindVersionOverview>;

/**
 * Reconciler-maintained projection at `kinds/{org}/{name}/overview.json`.
 *
 * `implementers` is the flat, RMW source of truth; `kindVersions` is the
 * derived, reader-facing view (kind versions × newest implementer per channel).
 */
export const KindOverview = z
  .object({
    schema: z.literal("v1"),
    implementers: z.array(KindImplementer),
    kindVersions: z.array(KindVersionOverview),
  })
  .passthrough();
export type KindOverview = z.infer<typeof KindOverview>;
