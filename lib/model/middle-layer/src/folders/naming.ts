/**
 * The one naming rule for folders, projects and templates.
 *
 * Scope is always the children of one parent — a folder, or the top level, which is simply the
 * folder with no parent — and one kind of item. No two folders, no two projects and no two
 * templates inside the same parent can carry the same name, while a folder, a project and a
 * template beside each other may: the list shows each kind under its own heading, so they are
 * never mistaken for one another. Comparison ignores case and surrounding whitespace: `Samples`,
 * `samples` and ` Samples ` are the same thing to the person looking at them.
 *
 * The rule auto-renames only where a machine chose the name — a move and a duplicate. Where a
 * human typed the name, a caller uses {@link foldersNameTaken} and rejects the name with
 * an error instead: a text field that quietly disagrees with what was typed is worse than one
 * that says no.
 *
 * Names already stored are never rewritten. Accounts predating folders may hold collisions,
 * because nothing enforced uniqueness before.
 */

/** True when a sibling already carries this name, compared as the rule above compares names. */
export function foldersNameTaken(name: string, siblingNames: Iterable<string>): boolean {
  const wanted = normalizeName(name);
  for (const sibling of siblingNames) if (normalizeName(sibling) === wanted) return true;
  return false;
}

/** True when a name has nothing in it but whitespace; a folder cannot be called that. */
export function foldersNameBlank(name: string): boolean {
  return name.trim() === "";
}

/**
 * The name to use for an item landing beside `siblingNames`.
 *
 * A free name is returned untouched. A taken one gains an `X (Copy)`, `X (Copy 2)` … suffix, and
 * an existing copy suffix is replaced rather than stacked, so repeated copies stay readable.
 */
export function foldersUniqueName(desiredName: string, siblingNames: Iterable<string>): string {
  const taken = new Set<string>();
  for (const sibling of siblingNames) taken.add(normalizeName(sibling));

  if (!taken.has(normalizeName(desiredName))) return desiredName;

  const base = desiredName.replace(COPY_SUFFIX, "");
  let candidate = `${base} (Copy)`;
  for (let index = 2; taken.has(normalizeName(candidate)); index++)
    candidate = `${base} (Copy ${index})`;
  return candidate;
}

//
// Internals
//

const COPY_SUFFIX = / \(Copy(?: \d+)?\)$/;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
