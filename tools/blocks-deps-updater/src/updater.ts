import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseDocument, isScalar, isAlias } from "yaml";

const RETRY_COUNT = 2;
const RETRY_BASE_MS = 500;
const TIMEOUT_MS = 30_000;

/** Parse Retry-After header: delay-seconds (e.g. "120") or HTTP-date (RFC 9110). Returns ms, or null if absent/invalid. */
function parseRetryAfter(header: string | null): number | null {
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
      // Respect Retry-After header: either delay-seconds or HTTP-date (RFC 9110)
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

async function getLatestVersion(packageName: string): Promise<string> {
  const res = await fetchWithRetry(`https://registry.npmjs.org/-/package/${packageName}/dist-tags`);

  const tags = (await res.json()) as Record<string, string>;
  const latest = tags.latest;
  if (!latest) {
    throw new Error("no 'latest' dist-tag in registry response");
  }

  return latest;
}

/**
 * Sets a value in the YAML document's catalog, preserving formatting.
 * - For scalar nodes: mutates value in-place (preserves quoting style)
 * - For alias nodes: replaces with a plain scalar (breaks the alias, intended)
 * Returns true if the value was changed.
 */
function setCatalogValue(opts: {
  doc: ReturnType<typeof parseDocument>;
  packageName: string;
  version: string;
}): boolean {
  const keyPath = ["catalog", opts.packageName];
  const node = opts.doc.getIn(keyPath, true);
  if (!node) return false;

  if (isScalar(node)) {
    if (node.value === opts.version) return false;
    node.value = opts.version;
    if (node.anchor) node.anchor = undefined;
    return true;
  }

  if (isAlias(node)) {
    const resolved = node.resolve(opts.doc);
    if (isScalar(resolved) && resolved.value === opts.version) return false;
    opts.doc.setIn(keyPath, opts.version);
    return true;
  }

  return false;
}

interface Change {
  packageName: string;
  from: string;
  to: string;
}

export async function updatePackages(cwd?: string): Promise<void> {
  const workspacePath = path.resolve(cwd ?? process.cwd(), "pnpm-workspace.yaml");

  let content: string;
  try {
    content = await fs.readFile(workspacePath, "utf8");
  } catch (cause) {
    throw new Error(`cannot read ${workspacePath}`, { cause });
  }

  const doc = parseDocument(content);
  const catalog = doc.toJSON()?.catalog as Record<string, unknown> | undefined;

  if (!catalog) {
    throw new Error("no 'catalog' section in pnpm-workspace.yaml");
  }

  const catalogKeys = Object.keys(catalog);
  const sdkPackages = catalogKeys.filter(
    (pkg) => pkg.startsWith("@platforma-sdk/") || pkg.startsWith("@milaboratories/"),
  );

  const updated: Change[] = [];

  // Fetch latest versions for all SDK packages in parallel
  const latestVersions = await Promise.all(sdkPackages.map((pkg) => getLatestVersion(pkg)));

  for (let i = 0; i < sdkPackages.length; i++) {
    const packageName = sdkPackages[i];
    const currentVersion = catalog[packageName];
    if (typeof currentVersion !== "string") continue;

    const latestVersion = latestVersions[i];
    const cleanCurrentVersion = currentVersion.replace(/^[\^~]/, "");

    if (cleanCurrentVersion !== latestVersion) {
      if (setCatalogValue({ doc, packageName, version: latestVersion })) {
        updated.push({ packageName, from: currentVersion, to: latestVersion });
      }
    }
  }

  if (updated.length === 0) {
    console.log("up to date");
    return;
  }

  try {
    await fs.writeFile(workspacePath, doc.toString(), "utf8");
  } catch (cause) {
    throw new Error(`cannot write ${workspacePath}`, { cause });
  }

  for (const c of updated) {
    console.log(`updated: ${c.packageName} ${c.from} -> ${c.to}`);
  }
}
