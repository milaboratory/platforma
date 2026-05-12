import type { ResourceAPI_Tree_Filter } from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import {
  ResourceAPI_Tree_Filter_OperatorType,
  ResourceAPI_Tree_Filter_Property,
} from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";

export type { ResourceAPI_Tree_Filter };

/** Shorthand alias for the filter predicate type. */
export type Filter = ResourceAPI_Tree_Filter;

/** Shorthand alias for the Property enum. */
export type Property = ResourceAPI_Tree_Filter_Property;

// Re-export enum namespaces under shorter aliases so callers need not import api.ts directly.
export { ResourceAPI_Tree_Filter_OperatorType as FilterOperatorType };
export { ResourceAPI_Tree_Filter_Property as FilterProperty };

/**
 * Builder helpers for {@link ResourceAPI_Tree_Filter} predicates used in
 * `ResourceAPI_Tree_Request.fieldFilter` and `traverseStopRules`.
 *
 * Property restrictions (not enforced here; the backend rejects invalid combinations):
 *   - `FIELD_NAME` is only valid inside `fieldFilter`.
 *   - `IS_FINAL`, `ALL_OUTPUTS_FINAL`, and resource-level boolean predicates are only valid inside `traverseStopRules`.
 */
export const treeFilter = {
  // ── Group operators ──────────────────────────────────────────────────────

  and(...children: Filter[]): Filter {
    return {
      operator: ResourceAPI_Tree_Filter_OperatorType.AND,
      value: { oneofKind: "filtersValue", filtersValue: { filters: children } },
    };
  },

  or(...children: Filter[]): Filter {
    return {
      operator: ResourceAPI_Tree_Filter_OperatorType.OR,
      value: { oneofKind: "filtersValue", filtersValue: { filters: children } },
    };
  },

  not(child: Filter): Filter {
    return {
      operator: ResourceAPI_Tree_Filter_OperatorType.NOT,
      value: { oneofKind: "filtersValue", filtersValue: { filters: [child] } },
    };
  },

  // ── Generic leaf operators ───────────────────────────────────────────────

  /** Exact-match predicate on a string property. */
  eq(prop: Property, value: string): Filter {
    return {
      key: prop,
      operator: ResourceAPI_Tree_Filter_OperatorType.EQUAL,
      value: { oneofKind: "stringValue", stringValue: value },
    };
  },

  /** Regex-match predicate on a string property. */
  match(prop: Property, pattern: string): Filter {
    return {
      key: prop,
      operator: ResourceAPI_Tree_Filter_OperatorType.MATCH,
      value: { oneofKind: "stringValue", stringValue: pattern },
    };
  },

  /** Boolean-equality predicate. */
  boolEq(prop: Property, value: boolean): Filter {
    return {
      key: prop,
      operator: ResourceAPI_Tree_Filter_OperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: value },
    };
  },

  // ── Typed convenience wrappers ───────────────────────────────────────────

  /** Match resources whose type string equals `name` exactly. */
  resourceTypeEq(name: string): Filter {
    return treeFilter.eq(ResourceAPI_Tree_Filter_Property.RESOURCE_TYPE, name);
  },

  /** Match resources whose type string satisfies the regex `pattern`. */
  resourceTypeMatch(pattern: string): Filter {
    return treeFilter.match(ResourceAPI_Tree_Filter_Property.RESOURCE_TYPE, pattern);
  },

  /**
   * Match field edges whose name equals `name` exactly.
   * Valid only inside `fieldFilter`.
   */
  fieldNameEq(name: string): Filter {
    return treeFilter.eq(ResourceAPI_Tree_Filter_Property.FIELD_NAME, name);
  },

  /**
   * Match field edges whose name satisfies the regex `pattern`.
   * Valid only inside `fieldFilter`.
   */
  fieldNameMatch(pattern: string): Filter {
    return treeFilter.match(ResourceAPI_Tree_Filter_Property.FIELD_NAME, pattern);
  },

  /**
   * Match resources where `is_final == value`.
   * Valid only inside `traverseStopRules`.
   */
  isFinal(value: boolean): Filter {
    return treeFilter.boolEq(ResourceAPI_Tree_Filter_Property.IS_FINAL, value);
  },

  /**
   * Match resources where `all_outputs_final == value`.
   * Valid only inside `traverseStopRules`.
   */
  allOutputsFinal(value: boolean): Filter {
    return treeFilter.boolEq(ResourceAPI_Tree_Filter_Property.ALL_OUTPUTS_FINAL, value);
  },

  /**
   * Match resources where `resource_ready_for_calculation == value`.
   * True when the resource is Original, inputs are locked, and all inputs are final.
   * Valid only inside `traverseStopRules`.
   */
  resourceReadyForCalculation(value: boolean): Filter {
    return treeFilter.boolEq(
      ResourceAPI_Tree_Filter_Property.RESOURCE_READY_FOR_CALCULATION,
      value,
    );
  },

  /**
   * Match resources where `is_duplicate == value`.
   * True when the resource has a non-zero original_resource_id.
   * Valid only inside `traverseStopRules`.
   */
  isDuplicate(value: boolean): Filter {
    return treeFilter.boolEq(ResourceAPI_Tree_Filter_Property.IS_DUPLICATE, value);
  },

  /**
   * Match resources where `has_errors == value`.
   * True when the resource has at least one field carrying an error (aggregated
   * has-error flag). Can be true even when the resource's own status is not
   * Error (e.g., an Original resource with a failed input field).
   * Valid only inside `traverseStopRules`.
   */
  hasErrors(value: boolean): Filter {
    return treeFilter.boolEq(ResourceAPI_Tree_Filter_Property.HAS_ERRORS, value);
  },

  /**
   * Match resources where `outputs_locked == value`.
   * Valid only inside `traverseStopRules`.
   */
  outputsLocked(value: boolean): Filter {
    return treeFilter.boolEq(ResourceAPI_Tree_Filter_Property.OUTPUTS_LOCKED, value);
  },

  /**
   * Match resources that are ready-or-duplicate-or-error: mirrors the BFS
   * `readyOrDuplicateOrError` predicate used by pl-tree to decide whether a
   * resource subtree needs further polling.
   *
   * Use this as `traverseStopRules` to stop the server-side tree walk at
   * exactly the same nodes where the client BFS would stop, eliminating
   * unnecessary follow-up calls.
   *
   * Valid only inside `traverseStopRules`.
   */
  readyOrDuplicateOrError(): Filter {
    return treeFilter.or(
      treeFilter.resourceReadyForCalculation(true),
      treeFilter.isDuplicate(true),
      treeFilter.hasErrors(true),
    );
  },
} as const;
