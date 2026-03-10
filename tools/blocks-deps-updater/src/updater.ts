import fs from "node:fs/promises";
import path from "node:path";
import { parseDocument, isScalar, isAlias } from "yaml";

/** Pinned versions for packages */
const PINNED_VERSIONS = {
  "ag-grid-enterprise": "~34.1.2",
  "ag-grid-vue3": "~34.1.2",
} as const;

async function getLatestVersion(packageName: string): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/-/package/${packageName}/dist-tags`);
  if (!res.ok) {
    throw new Error(`registry returned HTTP ${res.status}`);
  }

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
  const sdkPackages = catalogKeys
    .filter((pkg) => pkg.startsWith("@platforma-sdk/") || pkg.startsWith("@milaboratories/"))
    .filter((pkg) => !Object.hasOwn(PINNED_VERSIONS, pkg));

  const updated: Change[] = [];
  const pinned: Change[] = [];

  // Update SDK packages to latest from npm registry
  for (const packageName of sdkPackages) {
    const currentVersion = catalog[packageName];
    if (typeof currentVersion !== "string") continue;

    const cleanCurrentVersion = currentVersion.replace(/^[\^~]/, "");

    try {
      const latestVersion = await getLatestVersion(packageName);

      if (cleanCurrentVersion !== latestVersion) {
        if (setCatalogValue({ doc, packageName, version: latestVersion })) {
          updated.push({ packageName, from: currentVersion, to: latestVersion });
        }
      }
    } catch (error) {
      console.error(`skipped: ${packageName} — ${(error as Error).message}`);
    }
  }

  // Enforce pinned versions for licensed packages
  for (const [packageName, pinnedVersion] of Object.entries(PINNED_VERSIONS)) {
    if (!catalogKeys.includes(packageName)) continue;

    const currentVersion = catalog[packageName];
    if (typeof currentVersion !== "string") continue;

    if (setCatalogValue({ doc, packageName, version: pinnedVersion })) {
      pinned.push({ packageName, from: currentVersion, to: pinnedVersion });
    }
  }

  if (updated.length === 0 && pinned.length === 0) {
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
  for (const c of pinned) {
    console.log(` pinned: ${c.packageName} ${c.from} -> ${c.to}`);
  }
}
