// npm registry client used by `bumpCatalogToLatest`.
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
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
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
    } catch (err) {
      if (attempt > RETRY_COUNT) throw err;
    }
    const delay = RETRY_BASE_MS * 2 ** (attempt - 1) * (0.8 + 0.4 * Math.random());
    await sleep(delay);
  }
}

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
  };
}

/** In-memory client backed by a fixed `name → version` map. */
export function createMockRegistryClient(versions: Record<string, string>): RegistryClient {
  return {
    async getLatestVersion(packageName: string): Promise<string> {
      const v = versions[packageName];
      if (v === undefined) {
        throw new Error(`mock registry: no version configured for '${packageName}'`);
      }
      return v;
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
