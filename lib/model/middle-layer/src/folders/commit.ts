import type { ProjectId, TemplateId } from "@milaboratories/pl-model-common";
import type { FoldersDocument } from "./document";
import type {
  FoldersLabelRename,
  FoldersMoveIssue,
  FoldersMovePlan,
  FoldersMovePlanResult,
} from "./planner";
import { applyFoldersMove, foldersMovePlansEqual } from "./planner";
import type { FoldersRemoval, FoldersRemovalIssue, FoldersRemovalPlanResult } from "./removal";
import { applyFoldersRemoval, foldersRemovalsEqual } from "./removal";
import type { FoldersView } from "./view";

/** What one attempt of a folder write decided to do. */
export interface FoldersEdit<T> {
  /** Value handed back to the caller, whether or not anything is written. */
  readonly result: T;
  /** The document to persist. Absent means write nothing — a refused plan, or a no-op. */
  readonly document?: FoldersDocument;
  /** Project and template labels the edit changes; their names live in their own metadata. */
  readonly labelRenames?: readonly FoldersLabelRename[];
  /** Projects the edit destroys. A folder deletion is the only edit that sets this. */
  readonly deletedProjects?: readonly ProjectId[];
  /** Templates the edit destroys. A folder deletion is the only edit that sets this. */
  readonly deletedTemplates?: readonly TemplateId[];
}

/**
 * What a move did.
 *
 * `plan-changed` is the whole point of the confirm step: the plan was recomputed inside the write
 * transaction, it no longer matches the one the user confirmed, and nothing was written. The
 * fresh plan comes back to be confirmed again, so a confirmation dialog cannot lie about what an
 * item will end up called. `needs-confirmation` is the same guarantee reached from the other
 * side — a caller that supplied no plan at all for a move that renames something.
 *
 * All four cases have to be handled by whoever calls a move, which is why this type lives in this
 * package rather than in the node package.
 */
export type FoldersMoveOutcome =
  | { readonly ok: true; readonly plan: FoldersMovePlan }
  | { readonly ok: false; readonly reason: "plan-changed"; readonly plan: FoldersMovePlan }
  | {
      readonly ok: false;
      readonly reason: "needs-confirmation";
      readonly plan: FoldersMovePlan;
    }
  | {
      readonly ok: false;
      readonly reason: "cannot-plan";
      readonly issues: readonly FoldersMoveIssue[];
    };

/** What a folder deletion did. */
export type FoldersRemovalOutcome =
  | { readonly ok: true; readonly removal: FoldersRemoval }
  | {
      readonly ok: false;
      readonly reason: "plan-changed";
      readonly removal: FoldersRemoval;
    }
  | {
      readonly ok: false;
      readonly reason: "needs-confirmation";
      readonly removal: FoldersRemoval;
    }
  | {
      readonly ok: false;
      readonly reason: "cannot-plan";
      readonly issues: readonly FoldersRemovalIssue[];
    };

/**
 * The one place a move plan turns into a write.
 *
 * A move that renames nothing commits without a confirmed plan, because there is nothing to
 * confirm. A move that renames something needs one, and a confirmed plan must equal the plan
 * recomputed here, or nothing is written and the fresh plan goes back to be confirmed. A move of
 * nothing writes nothing.
 */
export function commitFoldersMove(
  view: FoldersView,
  planned: FoldersMovePlanResult,
  confirmedPlan: FoldersMovePlan | undefined,
): FoldersEdit<FoldersMoveOutcome> {
  if (!planned.ok) return { result: { ok: false, reason: "cannot-plan", issues: planned.issues } };

  if (confirmedPlan !== undefined) {
    if (!foldersMovePlansEqual(planned.plan, confirmedPlan))
      return { result: { ok: false, reason: "plan-changed", plan: planned.plan } };
  } else if (planned.plan.entries.some((entry) => entry.renamed)) {
    return { result: { ok: false, reason: "needs-confirmation", plan: planned.plan } };
  }

  // A move of nothing changes nothing. Without this it still mints a value and re-points the
  // field, so an empty selection would conflict with whatever else is editing the tree and would
  // persist a heal nobody asked for.
  if (planned.plan.entries.length === 0) return { result: { ok: true, plan: planned.plan } };

  const applied = applyFoldersMove(view, planned.plan);
  return {
    result: { ok: true, plan: planned.plan },
    document: applied.document,
    labelRenames: applied.labelRenames,
  };
}

/**
 * The one place a removal turns into a write.
 *
 * A deletion always needs a confirmed removal, however little it destroys: unlike a move, it has
 * no harmless outcome to fall back on.
 */
export function commitFoldersRemoval(
  view: FoldersView,
  planned: FoldersRemovalPlanResult,
  confirmed: FoldersRemoval | undefined,
): FoldersEdit<FoldersRemovalOutcome> {
  if (!planned.ok) return { result: { ok: false, reason: "cannot-plan", issues: planned.issues } };

  if (confirmed === undefined)
    return { result: { ok: false, reason: "needs-confirmation", removal: planned.removal } };

  if (!foldersRemovalsEqual(planned.removal, confirmed))
    return { result: { ok: false, reason: "plan-changed", removal: planned.removal } };

  return {
    result: { ok: true, removal: planned.removal },
    document: applyFoldersRemoval(view, planned.removal),
    deletedProjects: planned.removal.projects,
    deletedTemplates: planned.removal.templates,
  };
}
