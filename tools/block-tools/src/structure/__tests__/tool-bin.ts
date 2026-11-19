// Resolve a CLI tool's entry script through its package.json `bin` field, for
// tests that shell out to oxlint / oxfmt.
//
// Why not `node_modules/.bin/<tool>`? That shim is the right abstraction for a
// shell, but it cannot be spawned from Node without `shell: true`: the
// extensionless shim is an sh script (ENOENT on Windows) and the `.CMD` one is
// refused outright (EINVAL — Node's CVE-2024-27980 mitigation). Routing through
// a shell then hands the arguments to cmd.exe, which mangles any path holding a
// space or a `%`; these tests build paths under tmpdir(), so a machine whose
// user name contains a space would fail.
//
// The `bin` field is the same declarative contract the `.bin` shims are
// generated from, so reading it leaks no internal layout. It does assume the
// entry is a Node script — true for oxlint and oxfmt, and the assumption
// ts-builder's own executable resolver already makes.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** `requireRoot` is the file to resolve from — it decides WHICH copy of the
 *  tool is found (e.g. ts-builder's pinned oxlint vs block-tools' own).
 *  Returns undefined when the tool is not installed, so callers can skip. */
export function resolveToolBin(
  requireRoot: string,
  packageName: string,
  binName: string = packageName,
): string | undefined {
  try {
    const pkgJsonPath = createRequire(requireRoot).resolve(`${packageName}/package.json`);
    const meta = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const rel = typeof meta.bin === "string" ? meta.bin : meta.bin?.[binName];
    if (rel === undefined) return undefined;
    const binary = path.resolve(path.dirname(pkgJsonPath), rel);
    return existsSync(binary) ? binary : undefined;
  } catch {
    return undefined;
  }
}
