import { createRequire, findPackageJSON } from "node:module";
import { pathToFileURL } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";

export type ResolveError = "MODULE_NOT_FOUND" | "ERR_PACKAGE_PATH_NOT_EXPORTED";

export type ResolveResultOrError =
  | {
      result: string;
      err?: undefined;
    }
  | {
      result?: undefined;
      err: ResolveError;
    };

function rootToParentURL(root: string): string {
  // Use a dummy filename inside `root` as the "parent" for resolution.
  // Node treats it as a file URL even if the file doesn't exist, which
  // is exactly what the built-in resolver needs.
  return pathToFileURL(path.join(root, "index.js")).href;
}

/**
 * Resolve an ESM-only package subpath via `import.meta.resolve`-equivalent
 * logic. Returns a file path on success, or an error code on failure.
 *
 * Node does not expose a synchronous ESM resolver for arbitrary parent URLs
 * in stable form, so we approximate it using `findPackageJSON` + manual
 * subpath/exports interpretation. This is enough for the common cases used
 * across this codebase: resolving a package main entry, `pkg/package.json`,
 * or a package subpath.
 */
function esmResolve(root: string, request: string): ResolveResultOrError {
  const parent = rootToParentURL(root);
  let pkgJsonPath: string | undefined;
  try {
    pkgJsonPath = findPackageJSON(request, parent);
  } catch {
    return { err: "MODULE_NOT_FOUND" };
  }
  if (!pkgJsonPath) return { err: "MODULE_NOT_FOUND" };

  const pkgDir = path.dirname(pkgJsonPath);

  // Parse the package name out of the request so we know what the subpath is.
  // Supports both scoped ("@scope/name/sub") and unscoped ("name/sub").
  let pkgName: string;
  let subpath: string;
  if (request.startsWith("@")) {
    const firstSlash = request.indexOf("/");
    if (firstSlash === -1) return { err: "MODULE_NOT_FOUND" };
    const secondSlash = request.indexOf("/", firstSlash + 1);
    if (secondSlash === -1) {
      pkgName = request;
      subpath = ".";
    } else {
      pkgName = request.slice(0, secondSlash);
      subpath = "." + request.slice(secondSlash);
    }
  } else {
    const firstSlash = request.indexOf("/");
    if (firstSlash === -1) {
      pkgName = request;
      subpath = ".";
    } else {
      pkgName = request.slice(0, firstSlash);
      subpath = "." + request.slice(firstSlash);
    }
  }

  // Special-case: "package.json" subpath is always the found package.json
  // even when not listed in `exports` (mirrors Node's historical behaviour).
  if (subpath === "./package.json") {
    return { result: pkgJsonPath };
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as Record<string, unknown>;
  } catch {
    return { err: "MODULE_NOT_FOUND" };
  }

  if (pkg.name !== pkgName) {
    // findPackageJSON returned a parent package.json (e.g. when scanning a
    // workspace). Treat as not found.
    return { err: "MODULE_NOT_FOUND" };
  }

  const exportsField = pkg.exports;
  if (exportsField !== undefined && exportsField !== null) {
    const target = matchExports(exportsField, subpath);
    if (target === null) return { err: "ERR_PACKAGE_PATH_NOT_EXPORTED" };
    if (target === undefined) return { err: "MODULE_NOT_FOUND" };
    return { result: path.resolve(pkgDir, target) };
  }

  // No `exports` field — fall back to `main` / subpath.
  if (subpath === ".") {
    const main = typeof pkg.main === "string" ? pkg.main : "index.js";
    return { result: path.resolve(pkgDir, main) };
  }
  return { result: path.resolve(pkgDir, subpath) };
}

type ExportsValue = string | null | { [key: string]: ExportsValue } | ExportsValue[];

const CONDITIONS = ["node", "import", "default"];

function matchExports(exportsField: unknown, subpath: string): string | null | undefined {
  // String form: only valid for "." subpath.
  if (typeof exportsField === "string") {
    return subpath === "." ? exportsField : undefined;
  }
  if (exportsField === null) return null;
  if (Array.isArray(exportsField)) {
    for (const entry of exportsField) {
      const res = matchExports(entry, subpath);
      if (res !== undefined) return res;
    }
    return undefined;
  }
  if (typeof exportsField !== "object") return undefined;

  const obj = exportsField as Record<string, ExportsValue>;
  const keys = Object.keys(obj);
  const looksLikeSubpathMap = keys.length > 0 && keys.every((k) => k.startsWith("."));

  if (looksLikeSubpathMap) {
    // Exact match first.
    if (subpath in obj) {
      return resolveConditions(obj[subpath], subpath);
    }
    // Pattern match (wildcards / trailing-slash). Keep it simple — we only
    // handle the most common cases.
    for (const key of keys) {
      if (key.endsWith("/") && subpath.startsWith(key)) {
        const rest = subpath.slice(key.length);
        const resolved = resolveConditions(obj[key], subpath);
        if (resolved === null || resolved === undefined) return resolved;
        return resolved + rest;
      }
      if (key.includes("*")) {
        const [prefix, suffix] = key.split("*");
        if (subpath.startsWith(prefix) && subpath.endsWith(suffix ?? "")) {
          const middle = subpath.slice(prefix.length, subpath.length - (suffix?.length ?? 0));
          const target = resolveConditions(obj[key], subpath);
          if (typeof target !== "string") return target;
          return target.replace("*", middle);
        }
      }
    }
    return subpath === "." ? undefined : null;
  }

  // Conditional-only map (no subpaths). Only valid for "." subpath.
  if (subpath !== ".") return undefined;
  return resolveConditions(exportsField as ExportsValue, subpath);
}

// oxlint-disable-next-line oxc/only-used-in-recursion
function resolveConditions(value: ExportsValue, subpath: string): string | null | undefined {
  if (typeof value === "string" || value === null) return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const res = resolveConditions(entry, subpath);
      if (res !== undefined) return res;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;
  const obj = value as Record<string, ExportsValue>;
  for (const cond of CONDITIONS) {
    if (cond in obj) {
      const res = resolveConditions(obj[cond], subpath);
      if (res !== undefined) return res;
    }
  }
  if ("default" in obj) return resolveConditions(obj.default, subpath);
  return undefined;
}

const selfRequire = createRequire(import.meta.url);

function cjsResolve(root: string, request: string): ResolveResultOrError {
  try {
    const result = selfRequire.resolve(request, { paths: [root] });
    return { result };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "MODULE_NOT_FOUND" || code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      return { err: code };
    }
    throw err;
  }
}

export function tryResolveOrError(root: string, request: string): ResolveResultOrError {
  // Fast path: CJS resolver. Works for any package that exposes a `require`
  // or unconditional entry.
  const cjs = cjsResolve(root, request);
  if (cjs.result !== undefined) return cjs;

  // Fallback: ESM-aware resolution for packages that only publish `import`
  // conditionals (pure-ESM packages).
  const esm = esmResolve(root, request);
  if (esm.result !== undefined) return esm;

  // Prefer ERR_PACKAGE_PATH_NOT_EXPORTED over MODULE_NOT_FOUND if either
  // resolver reports it — callers rely on this code to distinguish the two
  // failure modes.
  if (cjs.err === "ERR_PACKAGE_PATH_NOT_EXPORTED" || esm.err === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
    return { err: "ERR_PACKAGE_PATH_NOT_EXPORTED" };
  }
  return { err: "MODULE_NOT_FOUND" };
}

export function tryResolve(root: string, request: string): string | undefined {
  return tryResolveOrError(root, request).result;
}
