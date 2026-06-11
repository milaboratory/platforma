// Minimal glob matcher for the structurer's file-existence triggers.
//
// Supports `**` (any number of path segments, including none), `*` (any
// run of chars except `/`), and `?` (a single non-`/` char); every other
// character is matched literally. No brace expansion / char classes — the
// patterns we match are deliberately simple (e.g. `src/**/*.test.ts`).
// Paths are matched whole (anchored at both ends).

const REGEXP_SPECIALS = /[.+^${}()|[\]\\]/g;

/** Compile a glob to an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**`: any path segments. Absorb a following `/` so `**/x` also
        // matches `x` at depth 0 (zero segments).
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(REGEXP_SPECIALS, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/** True if `path` matches `glob` (whole-path, anchored). */
export function matchesGlob(glob: string, path: string): boolean {
  return globToRegExp(glob).test(path);
}
