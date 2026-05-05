// Wire-level types for the LoadSubtree transaction method.
//
// These mirror MiLaboratories.PL.API.ResourceAPI.LoadSubtree in the proto but
// use TypeScript-idiomatic string unions instead of generated enums so
// middle-layer callers can describe pruning rules declaratively without
// importing proto-generated identifiers.

import {
  ResourceAPI_LoadSubtree_PruningRule_Action,
  ResourceAPI_LoadSubtree_PruningRule_TypeMatch,
  type ResourceAPI_LoadSubtree_PruningRule,
} from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import type { ResourceData } from "./types";
import type { AnyResourceRef, KeyValue } from "./transaction";

export type PruningRuleTypeMatch = "exact" | "prefix";
export type PruningRuleAction = "includeAll" | "dropAll" | "excludeFields";

/** A single pruning rule. Rules are evaluated in order when executing a
 *  LoadSubtree call; the first matching rule wins. A resource with no
 *  matching rule keeps all its fields and is descended into. */
export interface PruningRule {
  /** How type_pattern is matched against the resource type name. */
  typeMatch: PruningRuleTypeMatch;
  /** Pattern compared with the resource's type.name. */
  typePattern: string;
  /** Action applied to the matched resource. */
  action: PruningRuleAction;
  /** For action="excludeFields": exact field names to drop. */
  fieldNames?: string[];
  /** For action="excludeFields": drop fields whose name starts with any of
   *  these prefixes. */
  fieldNamePrefixes?: string[];
}

/** Declarative spec for server-side subtree pruning. Equivalent to the
 *  classic in-memory PruningFunction but transmissible over the wire. */
export type PruningSpec = readonly PruningRule[];

export interface LoadSubtreeOptions {
  /** Root of the server-side walk. */
  root: AnyResourceRef;
  /** Resources the client already holds in its up-to-date state; the server
   *  returns no data for these and does not descend past them. */
  knownFinals?: Iterable<AnyResourceRef>;
  /** Pruning rules — see {@link PruningSpec}. */
  pruning?: PruningSpec;
  /** If true, per-resource key-values are returned alongside each resource.
   *  Defaults to false. */
  includeKv?: boolean;
  /** Safety limit for the total number of visited resources. Zero = server
   *  default. */
  maxResources?: number;
}

/** Single entry produced by {@link PlTransaction.loadSubtree}. */
export interface LoadedSubtreeNode {
  resource: ResourceData;
  /** Empty unless the request was made with includeKv=true. */
  kv: KeyValue[];
}

export function encodePruningRule(rule: PruningRule): ResourceAPI_LoadSubtree_PruningRule {
  return {
    typeMatch:
      rule.typeMatch === "prefix"
        ? ResourceAPI_LoadSubtree_PruningRule_TypeMatch.PREFIX
        : ResourceAPI_LoadSubtree_PruningRule_TypeMatch.EXACT,
    typePattern: rule.typePattern,
    action: encodeAction(rule.action),
    fieldNames: rule.fieldNames ?? [],
    fieldNamePrefixes: rule.fieldNamePrefixes ?? [],
  };
}

function encodeAction(a: PruningRuleAction): ResourceAPI_LoadSubtree_PruningRule_Action {
  switch (a) {
    case "includeAll":
      return ResourceAPI_LoadSubtree_PruningRule_Action.INCLUDE_ALL;
    case "dropAll":
      return ResourceAPI_LoadSubtree_PruningRule_Action.DROP_ALL;
    case "excludeFields":
      return ResourceAPI_LoadSubtree_PruningRule_Action.EXCLUDE_FIELDS;
  }
}
