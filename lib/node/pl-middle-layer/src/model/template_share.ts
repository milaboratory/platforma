import type { ProjectTemplateV1 } from "@milaboratories/pl-model-common";
import { parseBlockPackLocation } from "@milaboratories/pl-model-common";

/** One template entry standing in the way of sharing the template, and why. */
export type TemplateShareProblem = {
  /** The template-local id of the entry the problem belongs to; on an exported template it is
   *  the block's project-local uuid. */
  readonly entryId: string;
  readonly error: string;
};

/**
 * Every entry of a template that cannot travel to another machine, or an empty list for a
 * template that can be shared.
 *
 * An entry's `location` names a place rather than a name, and a `file:` place is a folder on
 * the author's own disk: a recipient resolving it finds nothing, or worse finds something
 * else. Such a template stays perfectly usable where it was made, so it is stored and applied
 * as normal — only sharing it is refused.
 *
 * A location whose scheme cannot be read is refused for the same reason: nothing can resolve
 * it anywhere, here included.
 *
 * Every offending entry is reported, not only the first, so a UI can name each block instead
 * of sending its user round the loop once per entry.
 */
export function unshareableTemplateEntries(
  document: ProjectTemplateV1,
): readonly TemplateShareProblem[] {
  const problems: TemplateShareProblem[] = [];
  for (const entry of document.blocks) {
    if (entry.location === undefined) continue;
    let scheme: string;
    try {
      scheme = parseBlockPackLocation(entry.location).scheme;
    } catch (e) {
      problems.push({
        entryId: entry.id,
        error: `Block is installed from a location nothing can resolve: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    if (scheme === "file")
      problems.push({
        entryId: entry.id,
        error:
          `Block is installed from ${entry.location}, a folder on this machine — it resolves ` +
          "to nothing on the recipient's, so this template cannot be shared",
      });
  }
  return problems;
}
