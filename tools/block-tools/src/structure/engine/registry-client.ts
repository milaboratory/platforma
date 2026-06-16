// npm registry client used by the catalog ensure-family (`ensureCatalogLatest`).
//
// The content-rule builder is synchronous; the runner pre-resolves
// "latest" versions via this client and passes a sync lookup function
// to `withManagedYaml(..., { getLatestVersion })`. The real impl talks
// to https://registry.npmjs.org with retry + Retry-After handling
// ported from `tools/blocks-deps-updater/src/updater.ts`. The mock
// impl wraps an in-memory map and is the only client used in unit
// tests.

import { setTimeout as sleep } from "node:timers/promises";

export interface RegistryClient {
  getLatestVersion(packageName: string): Promise<string>;
  /** Read the version `packageName@version` declares for `depName` in its
   *  published manifest. `version` may be "latest" (resolved via the
   *  dist-tags). Looks in `dependencies` first, then `peerDependencies`.
   *  Returns `undefined` when the dep is declared in neither section. */
  getDeclaredDependency(
    packageName: string,
    version: string,
    depName: string,
  ): Promise<string | undefined>;
}

const RETRY_COUNT = 2;
const RETRY_BASE_MS = 500;
const TIMEOUT_MS = 30_000;

/** Parse the HTTP Retry-After header (RFC 9110): either a delay in
 *  seconds or an absolute HTTP-date. Returns the delay in ms, or null
 *  if the header is missing / unparseable. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    // Only the network call is retry-eligible: a transport error
    // (timeout, DNS, reset) is transient. HTTP-status handling sits
    // OUTSIDE this catch so a non-retryable status (404/403) throws
    // immediately instead of being swallowed and retried.
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      if (attempt > RETRY_COUNT) throw err;
      const delay = RETRY_BASE_MS * 2 ** (attempt - 1) * (0.8 + 0.4 * Math.random());
      await sleep(delay);
      continue;
    }
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt > RETRY_COUNT) {
      throw new Error(`registry returned HTTP ${res.status}`);
    }
    const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
    if (retryAfterMs != null) {
      await sleep(retryAfterMs);
      continue;
    }
    const delay = RETRY_BASE_MS * 2 ** (attempt - 1) * (0.8 + 0.4 * Math.random());
    await sleep(delay);
  }
}

/** Shape of the per-version manifest doc fetched from
 *  `https://registry.npmjs.org/<pkg>/<version>` (only the dep sections are
 *  read). */
type PackageManifest = {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** Live npm registry client. Hits the network on each call. */
export function createRealRegistryClient(): RegistryClient {
  return {
    async getLatestVersion(packageName: string): Promise<string> {
      const res = await fetchWithRetry(
        `https://registry.npmjs.org/-/package/${packageName}/dist-tags`,
      );
      const tags = (await res.json()) as Record<string, string>;
      const latest = tags.latest;
      if (!latest) {
        throw new Error("no 'latest' dist-tag in registry response");
      }
      return latest;
    },
    async getDeclaredDependency(
      packageName: string,
      version: string,
      depName: string,
    ): Promise<string | undefined> {
      const res = await fetchWithRetry(`https://registry.npmjs.org/${packageName}/${version}`);
      const manifest = (await res.json()) as PackageManifest;
      return manifest.dependencies?.[depName] ?? manifest.peerDependencies?.[depName];
    },
  };
}

/** In-memory client backed by a fixed `name → version` map. The optional
 *  `manifests` map (`pkg@version` → declared deps) backs
 *  `getDeclaredDependency`; "latest" keys resolve via the `versions` map. */
export function createMockRegistryClient(
  versions: Record<string, string>,
  manifests: Record<string, Record<string, string>> = {},
): RegistryClient {
  function resolveVersion(packageName: string, version: string): string {
    if (version !== "latest") return version;
    const v = versions[packageName];
    if (v === undefined) {
      throw new Error(`mock registry: no version configured for '${packageName}'`);
    }
    return v;
  }
  return {
    async getLatestVersion(packageName: string): Promise<string> {
      const v = versions[packageName];
      if (v === undefined) {
        throw new Error(`mock registry: no version configured for '${packageName}'`);
      }
      return v;
    },
    async getDeclaredDependency(
      packageName: string,
      version: string,
      depName: string,
    ): Promise<string | undefined> {
      const resolved = resolveVersion(packageName, version);
      const deps = manifests[`${packageName}@${resolved}`];
      if (deps === undefined) {
        throw new Error(`mock registry: no manifest configured for '${packageName}@${resolved}'`);
      }
      return deps[depName];
    },
  };
}

/** Resolve a batch of `name → latest` entries in parallel. */
export async function prefetchLatestVersions(
  client: RegistryClient,
  packageNames: readonly string[],
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    packageNames.map(async (n) => [n, await client.getLatestVersion(n)] as const),
  );
  return new Map(entries);
}

/** Build a sync lookup function (the shape `withManagedYaml` consumes)
 *  from a prefetched map. Returns undefined for unknown names. */
export function makeSyncLookup(
  resolved: Map<string, string>,
): (packageName: string) => string | undefined {
  return (name) => resolved.get(name);
}

/** Catalog package-name patterns the version-resolution rules
 *  (`ensureCatalogLatest`) match against — the `@platforma-sdk/*` and
 *  `@milaboratories/*` SDK families. Infra/runtime entries (turbo, shx,
 *  …) are deliberately NOT here: they stay a curated floor, not auto-latest.
 *  Shared so `init` (names from the SDK pin map) and `refresh
 *  --update-deps-only` (names from the on-disk catalog) select the same
 *  set. */
export const CATALOG_BUMP_PATTERNS: readonly RegExp[] = [/^@platforma-sdk\//, /^@milaboratories\//];

/** True if `name` is a version-resolved SDK package (matches any bump
 *  pattern). */
export function matchesBumpPattern(name: string): boolean {
  return CATALOG_BUMP_PATTERNS.some((p) => p.test(name));
}

/** Prefetch npm "latest" for `names` and return the sync lookup the
 *  runner passes to the catalog ensure-family (`ensureCatalogLatest`).
 *  Empty list → a lookup that
 *  resolves nothing (no network). A network/registry failure REJECTS
 *  (callers that require the network — `init` — let it propagate).
 *  `client` defaults to the live npm client; tests inject a mock. */
export async function buildRegistryLookupForNames(
  names: readonly string[],
  client: RegistryClient = createRealRegistryClient(),
): Promise<(packageName: string) => string | undefined> {
  if (names.length === 0) return () => undefined;
  const resolved = await prefetchLatestVersions(client, names);
  return makeSyncLookup(resolved);
}

/** A catalog entry whose version is DERIVED from the version another
 *  package declares for it. `entry` is the catalog key (== the dep name in
 *  the source manifest); `of` is the package whose manifest is read; the
 *  optional `ofVersion` pins which release of `of` to read (default: npm
 *  latest, the same release the catalog bump pins `of` to). Consumed by
 *  `pinCatalogToDependencyOf`. */
export type DerivedCatalogPin = {
  entry: string;
  of: string;
  ofVersion?: string;
};

/** True iff `version` is a bare exact `x.y.z(-prerelease)?` — no range
 *  modifier (`^`, `~`, `>=`, `*`, `||`, ` - `, `x`, workspace:, etc.). */
function isExactVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}

/** Prefetch every derived pin and build the sync lookup the runner passes
 *  to `pinCatalogToDependencyOf` (`entry → exact version`). Reads
 *  `pin.of`'s manifest (at `pin.ofVersion`, default npm latest) and the
 *  version it declares for `pin.entry`. Policy (b): THROWS at prefetch time
 *  if the source declares the dep as a non-exact (ranged) version or does
 *  not declare it at all — a derived pin must resolve to an exact version
 *  or it is a configuration error. Empty list → a lookup that resolves
 *  nothing (no network). A registry failure REJECTS. `client` defaults to
 *  the live npm client; tests inject a mock. */
export async function buildDerivedPinLookupForPins(
  pins: readonly DerivedCatalogPin[],
  client: RegistryClient = createRealRegistryClient(),
): Promise<(entry: string) => string | undefined> {
  if (pins.length === 0) return () => undefined;
  const entries = await Promise.all(
    pins.map(async (pin) => {
      const declared = await client.getDeclaredDependency(
        pin.of,
        pin.ofVersion ?? "latest",
        pin.entry,
      );
      if (declared === undefined) {
        throw new Error(
          `derived catalog pin '${pin.entry}': package '${pin.of}'` +
            `${pin.ofVersion ? `@${pin.ofVersion}` : " (latest)"} declares no ` +
            `dependency '${pin.entry}'. A derived pin requires the source to ` +
            `declare the dep as an exact version.`,
        );
      }
      if (!isExactVersion(declared)) {
        throw new Error(
          `derived catalog pin '${pin.entry}': package '${pin.of}'` +
            `${pin.ofVersion ? `@${pin.ofVersion}` : " (latest)"} declares ` +
            `'${pin.entry}: ${declared}', which is not an exact version. ` +
            `A derived pin requires an exact ('x.y.z') source dependency so ` +
            `the catalog can pin to it precisely.`,
        );
      }
      return [pin.entry, declared] as const;
    }),
  );
  const resolved = new Map(entries);
  return (entry) => resolved.get(entry);
}
