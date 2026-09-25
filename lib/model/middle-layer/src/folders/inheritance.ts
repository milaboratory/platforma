import type { ProjectId } from "@milaboratories/pl-model-common";
import type { FolderId } from "./document";
import { foldersNameTaken } from "./naming";
import type { FoldersLeafItem } from "./planner";
import type { FoldersView } from "./view";
import { foldersSiblingNames } from "./view";

/**
 * The folder a newly created item should land in, given the project it was made from.
 *
 * A copy of a project, and a template taken from one, belong beside their source; landing at the
 * top level reads as the app having lost them. `undefined` means leave it at the top level:
 *
 * - the source is itself at the top level, or is no longer in the tree at all;
 * - an item of the created one's kind already carries the name where the source sits. The
 *   creating caller chose that name, so suffixing it here would disagree with what it reported,
 *   and refusing the whole creation over a placement would be the worse trade.
 */
export function inheritedFolder(
  view: FoldersView,
  source: ProjectId,
  created: FoldersLeafItem,
  name: string,
): FolderId | undefined {
  const folder = view.projects.find((candidate) => candidate.id === source)?.folder;
  if (folder === undefined) return undefined;

  // Scoped to the destination and to the created item's kind, because the rule is: names are
  // unique among one kind within a parent, never globally. The item being created is left out in
  // case the view already lists it.
  const siblings = foldersSiblingNames(view, created.kind, folder, [created.id]);
  return foldersNameTaken(name, siblings) ? undefined : folder;
}
