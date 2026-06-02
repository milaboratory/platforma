// Workspace-package classification — the seven scope detection rules.
//
// Input: the parsed package.json of every workspace member, plus its
// block-relative path. Output: `Module[]` (scope + name + path).
// First-match wins on the detection rules; an explicit `block-scope`
// override on package.json skips detection.

import type { Module, Scope } from "./api";

export const ALL_SCOPES: Scope[] = ["root", "block", "model", "ui", "workflow", "test", "software"];

export type WorkspacePackage = {
  /** Block-relative path of the package — "" or "." means the
   *  workspace root. */
  path: string;
  /** Parsed package.json. */
  pkg: PackageJsonLike;
};

export type PackageJsonLike = {
  name?: string;
  main?: string;
  files?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  // Override field — value MUST be one of the seven scopes.
  "block-scope"?: string;
  "block-software"?: unknown;
};

export class DiscoveryError extends Error {
  constructor(
    msg: string,
    public readonly path?: string,
  ) {
    super(msg);
    this.name = "DiscoveryError";
  }
}

function depKeys(pkg: PackageJsonLike): Set<string> {
  const all = new Set<string>();
  for (const section of [
    pkg.dependencies,
    pkg.devDependencies,
    pkg.peerDependencies,
    pkg.optionalDependencies,
  ]) {
    if (section) for (const k of Object.keys(section)) all.add(k);
  }
  return all;
}

function isRoot(p: string): boolean {
  return p === "" || p === ".";
}

/**
 * Classify one package.
 *
 * @param wp The workspace package.
 * @param siblingNames Set of all workspace package `name`s (used by
 *   rule 4 "block": depends on ≥2 sibling .model/.ui/.workflow).
 * @returns Scope or `undefined` if unclassified.
 */
export function classifyOne(wp: WorkspacePackage, siblingNames: Set<string>): Scope | undefined {
  const override = wp.pkg["block-scope"];
  if (typeof override === "string") {
    if (!(ALL_SCOPES as string[]).includes(override)) {
      throw new DiscoveryError(
        `package.json "block-scope" must be one of ${ALL_SCOPES.join(", ")}, got '${override}'`,
        wp.path,
      );
    }
    return override as Scope;
  }

  // Standalone implicit root: the package at path "" is present
  // because pnpm-workspace.yaml lives there, so it IS the workspace root —
  // classify it as `root` unconditionally, BEFORE any detection rule. A
  // nameless root carrying legacy facade cruft (`files: ["index.d.ts",
  // "index.js"]` + block-tools, e.g. sequence-properties) must NOT fall
  // through to the rule-4 block fallback and become a nameless second
  // `block` module — root-as-facade is a forbidden anti-pattern.
  // SDK-internal enumeration never produces a path-"" package (it scans
  // sub-package dirs), so this only ever fires in standalone mode.
  if (isRoot(wp.path)) return "root";

  const deps = depKeys(wp.pkg);

  // 1. software — top-level `block-software` field OR
  //    (package-builder AND any @platforma-open/*runenv* dep).
  if (wp.pkg["block-software"] !== undefined) return "software";
  if (deps.has("@platforma-sdk/package-builder")) {
    for (const d of deps) {
      if (/^@platforma-open\/.*runenv/.test(d)) return "software";
    }
  }

  // 2. workflow — @platforma-sdk/workflow-tengo in deps.
  if (deps.has("@platforma-sdk/workflow-tengo")) return "workflow";

  // 3. ui — (ui-vue OR vue) AND main is not set.
  if ((deps.has("@platforma-sdk/ui-vue") || deps.has("vue")) && !wp.pkg.main) {
    return "ui";
  }

  // 4. block — block-tools in deps AND ≥2 sibling .model/.ui/.workflow.
  if (deps.has("@platforma-sdk/block-tools")) {
    const matches = [...deps].filter(
      (d) =>
        siblingNames.has(d) &&
        (d.endsWith(".model") || d.endsWith(".ui") || d.endsWith(".workflow")),
    );
    if (matches.length >= 2) return "block";
    // Fallback: `files == ["index.d.ts", "index.js"]` + block-tools.
    const files = wp.pkg.files;
    if (
      Array.isArray(files) &&
      files.length === 2 &&
      files.includes("index.d.ts") &&
      files.includes("index.js")
    ) {
      return "block";
    }
  }

  // 5. model — @platforma-sdk/model in deps AND main is set.
  if (deps.has("@platforma-sdk/model") && wp.pkg.main) return "model";

  // 6. test — @platforma-sdk/test in deps.
  if (deps.has("@platforma-sdk/test")) return "test";

  // (root — the workspace root, path "", is classified above, before the
  // detection rules, so it can never reach this fallthrough.)
  return undefined;
}

/**
 * Classify a whole workspace. Throws on the first unclassified package
 * with a message that directs the operator to add `block-scope` to its
 * package.json.
 */
export function discoverModules(packages: WorkspacePackage[]): Module[] {
  const siblingNames = new Set<string>();
  for (const p of packages) {
    if (typeof p.pkg.name === "string") siblingNames.add(p.pkg.name);
  }
  const out: Module[] = [];
  for (const p of packages) {
    const scope = classifyOne(p, siblingNames);
    if (!scope) {
      throw new DiscoveryError(
        `Unclassified workspace package at '${p.path}'. ` +
          `Add a top-level "block-scope" string to its package.json.`,
        p.path,
      );
    }
    out.push({
      scope,
      name: p.pkg.name ?? p.path,
      path: isRoot(p.path) ? "" : p.path,
    });
  }
  return out;
}
