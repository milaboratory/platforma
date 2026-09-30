import type {
  Filter,
  FinalityEntry,
  FinalityTable,
  TranslatableFinalityRule,
} from "@milaboratories/pl-client";
import { treeFilter } from "@milaboratories/pl-client";

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function typeFilter(match: FinalityEntry["match"]): Filter {
  return "name" in match
    ? treeFilter.resourceTypeEq(match.name)
    : treeFilter.resourceTypeMatch("^" + escapeRegExp(match.prefix));
}

function conditionFilter(type: Filter, rule: TranslatableFinalityRule): Filter {
  switch (rule) {
    case "always":
      return type;
    case "readyOrDuplicateOrError":
      return treeFilter.and(type, treeFilter.readyOrDuplicateOrError());
    case "readyAndAllOutputsFilled":
      return treeFilter.and(
        type,
        treeFilter.readyOrDuplicateOrError(),
        treeFilter.outputsLocked(true),
        treeFilter.allOutputsFinal(true),
      );
  }
}

/** The stop-rule clause of one entry, or undefined when the entry sends none: a `never` rule,
 * or a `none` declaration. */
export function finalityStopRuleClause(entry: FinalityEntry): Filter | undefined {
  if (entry.rule === "never") return undefined;
  const declared = entry.stopRule ?? "exact";
  if (typeof declared === "object" && "none" in declared) return undefined;
  if (declared !== "exact") return conditionFilter(typeFilter(entry.match), declared.approx);
  // a custom rule always carries a non-exact declaration, by its entry type
  if (typeof entry.rule === "object") return undefined;
  return conditionFilter(typeFilter(entry.match), entry.rule);
}

/**
 * Traversal stop rules for a finality table: the backend stops a walk at a resource the table
 * calls final. Each entry translates as it declares — exactly, by an approximation with its
 * reason, or not at all.
 */
export function finalityStopRules(table: FinalityTable): Filter {
  const clauses: Filter[] = [];
  for (const e of table.entries) {
    const clause = finalityStopRuleClause(e);
    if (clause !== undefined) clauses.push(clause);
  }
  return treeFilter.or(...clauses);
}
