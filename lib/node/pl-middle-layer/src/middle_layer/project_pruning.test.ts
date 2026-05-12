/**
 * Parity tests verifying that the new ResourceTree field-filter + traversal-stop-rule
 * predicates produce the same outcome as the legacy BFS pruning functions.
 *
 * §4.1 — pruning parity: projectTreePruning ⇄ projectTreeFieldFilter
 *         and ProjectsListTreePruningFunction ⇄ projectsListFieldFilter
 * §4.2 — stop-rule isolation coverage for projectTreeTraverseStopRules
 * §4.3 — final-predicate parity: DefaultFinalResourceDataPredicate ⇄ projectTreeTraverseStopRules
 */

import { describe, expect, it } from "vitest";
import {
  projectTreeFieldFilter,
  projectTreePruning,
  projectTreeTraverseStopRules,
} from "./project";
import { projectsListFieldFilter, ProjectsListTreePruningFunction } from "./project_list";
import type { Filter } from "@milaboratories/pl-client";
import {
  DefaultFinalResourceDataPredicate,
  FilterOperatorType,
  FilterProperty,
  NullSignedResourceId,
} from "@milaboratories/pl-client";
import type { ExtendedResourceData } from "@milaboratories/pl-tree";
import type { MiLogger } from "@milaboratories/ts-helpers";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal no-op logger satisfying MiLogger interface. */
const noopLogger: MiLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Build a minimal ExtendedResourceData for tests. */
function makeResource(
  typeName: string,
  fieldNames: string[],
): ExtendedResourceData {
  return {
    id: "NG:0x1" as any,
    type: { name: typeName, version: "1" },
    kind: "Structural",
    data: undefined,
    resourceReady: false,
    error: NullSignedResourceId,
    originalResourceId: NullSignedResourceId,
    final: false,
    inputsLocked: false,
    outputsLocked: false,
    fields: fieldNames.map((name) => ({
      name,
      type: "Dynamic",
      value: NullSignedResourceId,
      error: NullSignedResourceId,
      status: "Resolved",
      valueIsFinal: false,
    })),
    kv: [],
  } as unknown as ExtendedResourceData;
}

/** Build a resource where resourceReady=true (satisfies readyOrDuplicateOrError). */
function makeReadyResource(typeName: string, version = "1"): ExtendedResourceData {
  return { ...makeResource(typeName, []), type: { name: typeName, version }, resourceReady: true };
}

/**
 * Build a resource that satisfies readyAndHasAllOutputsFilled:
 *   resourceReady=true, outputsLocked=true, one field with valueIsFinal=true.
 */
function makeAllOutputsFinalResource(typeName: string): ExtendedResourceData {
  const base = makeResource(typeName, ["output"]);
  return {
    ...base,
    resourceReady: true,
    outputsLocked: true,
    fields: [
      {
        name: "output",
        type: "Dynamic",
        value: "NG:0x99" as any,
        error: NullSignedResourceId,
        status: "Resolved",
        valueIsFinal: true,
      } as any,
    ],
  } as unknown as ExtendedResourceData;
}

/** Evaluate a single Filter against a resource + optional field-name context. */
function evalFilter(
  filter: Filter,
  ctx: { resourceType: string; fieldName?: string; isFinal?: boolean; allOutputsFinal?: boolean },
): boolean {
  const { resourceType, fieldName = "", isFinal = false, allOutputsFinal = false } = ctx;

  if (filter.value.oneofKind === "filtersValue") {
    const children = filter.value.filtersValue.filters;
    switch (filter.operator) {
      case FilterOperatorType.AND:
        return children.every((c) => evalFilter(c, ctx));
      case FilterOperatorType.OR:
        return children.some((c) => evalFilter(c, ctx));
      case FilterOperatorType.NOT:
        return !evalFilter(children[0]!, ctx);
      default:
        return false;
    }
  }

  if (filter.value.oneofKind === "stringValue") {
    const pattern = filter.value.stringValue;
    let subject: string;
    switch (filter.key) {
      case FilterProperty.RESOURCE_TYPE:
        subject = resourceType;
        break;
      case FilterProperty.FIELD_NAME:
        subject = fieldName;
        break;
      default:
        return false;
    }
    switch (filter.operator) {
      case FilterOperatorType.EQUAL:
        return subject === pattern;
      case FilterOperatorType.MATCH:
        return new RegExp(pattern).test(subject);
      default:
        return false;
    }
  }

  if (filter.value.oneofKind === "boolValue") {
    const want = filter.value.boolValue;
    switch (filter.key) {
      case FilterProperty.IS_FINAL:
        return isFinal === want;
      case FilterProperty.ALL_OUTPUTS_FINAL:
        return allOutputsFinal === want;
      default:
        return false;
    }
  }

  return false;
}

/**
 * Apply fieldFilter to a resource's fields.
 * A field is kept when the filter evaluates true for that (resource, field) pair.
 */
function evaluateFieldFilter(
  filter: Filter,
  resource: { type: { name: string }; fields: { name: string }[] },
): string[] {
  return resource.fields
    .filter((f) =>
      evalFilter(filter, { resourceType: resource.type.name, fieldName: f.name }),
    )
    .map((f) => f.name);
}

/** Evaluate traverseStopRules (a single filter) against a resource. */
function evaluateStopRule(
  rule: Filter,
  ctx: { resourceType: string; isFinal?: boolean; allOutputsFinal?: boolean },
): boolean {
  return evalFilter(rule, ctx);
}

// ── §4.1 — Pruning parity: projectTreePruning ⇄ projectTreeFieldFilter ────

const projectPruningCases: Array<{
  name: string;
  typeName: string;
  fields: string[];
  expected: string[];
}> = [
  {
    name: "StreamWorkdir/* — all fields dropped",
    typeName: "StreamWorkdir/run-42",
    fields: ["cmd", "output"],
    expected: [],
  },
  {
    name: "BlockPackCustom — template dropped, other kept",
    typeName: "BlockPackCustom",
    fields: ["template", "output"],
    expected: ["output"],
  },
  {
    name: "UserProject — __serviceTemplate* dropped, others kept",
    typeName: "UserProject",
    fields: ["__serviceTemplateA", "__serviceTemplateB", "x"],
    expected: ["x"],
  },
  {
    name: "Blob — all fields dropped",
    typeName: "Blob",
    fields: ["data"],
    expected: [],
  },
  {
    name: "arbitrary other type — all fields kept",
    typeName: "SomeStructure",
    fields: ["a", "b", "c"],
    expected: ["a", "b", "c"],
  },
];

describe("§4.1 project tree pruning parity", () => {
  const pruner = projectTreePruning(noopLogger);
  const filter = projectTreeFieldFilter();

  for (const c of projectPruningCases) {
    it(`${c.name} — BFS keeps [${c.expected.join(",")}]`, () => {
      const resource = makeResource(c.typeName, c.fields);
      const kept = pruner(resource).map((f) => f.name);
      expect(kept).toEqual(c.expected);
    });

    it(`${c.name} — fieldFilter keeps [${c.expected.join(",")}]`, () => {
      const resource = makeResource(c.typeName, c.fields);
      const kept = evaluateFieldFilter(filter, resource);
      expect(kept).toEqual(c.expected);
    });
  }
});

// ── §4.1 — Pruning parity: ProjectsListTreePruningFunction ⇄ projectsListFieldFilter

const projectsListPruningCases: Array<{
  name: string;
  typeName: string;
  fields: string[];
  expected: string[];
}> = [
  {
    name: "Projects root — all fields kept",
    typeName: "Projects",
    fields: ["project-1", "project-2"],
    expected: ["project-1", "project-2"],
  },
  {
    name: "non-Projects (UserProject) — no fields traversed",
    typeName: "UserProject",
    fields: ["x", "y"],
    expected: [],
  },
  {
    name: "non-Projects (Blob) — no fields traversed",
    typeName: "Blob",
    fields: ["data"],
    expected: [],
  },
];

describe("§4.1 projects-list pruning parity", () => {
  const filter = projectsListFieldFilter;

  for (const c of projectsListPruningCases) {
    it(`${c.name} — BFS keeps [${c.expected.join(",")}]`, () => {
      const resource = makeResource(c.typeName, c.fields);
      const kept = ProjectsListTreePruningFunction(resource).map((f) => f.name);
      expect(kept).toEqual(c.expected);
    });

    it(`${c.name} — fieldFilter keeps [${c.expected.join(",")}]`, () => {
      const resource = makeResource(c.typeName, c.fields);
      const kept = evaluateFieldFilter(filter, resource);
      expect(kept).toEqual(c.expected);
    });
  }
});

// ── §4.2 — traverseStopRules coverage ────────────────────────────────────────

describe("§4.2 projectTreeTraverseStopRules", () => {
  const rule = projectTreeTraverseStopRules();

  // Always-terminal exact types
  const alwaysTerminalTypes = [
    "json/object",
    "json-gz/object",
    "json/string",
    "json/array",
    "json/number",
    "binary",
    "Frontend/FromUrl",
    "Frontend/FromFolder",
    "BObjectSpec",
    "BContextEnd",
    "Null",
    "LSProvider",
    "Blob",
  ];
  for (const t of alwaysTerminalTypes) {
    it(`always-terminal: ${t}`, () => {
      expect(evaluateStopRule(rule, { resourceType: t })).toBe(true);
    });
  }

  // Always-terminal prefix types
  const prefixTerminalCases: Array<{ desc: string; type: string }> = [
    { desc: "Blob/ prefix", type: "Blob/v2" },
    { desc: "LS/ prefix", type: "LS/remote" },
    { desc: "WorkingDirectory/ prefix", type: "WorkingDirectory/1" },
    { desc: "StorageSpaceAllocation/ prefix", type: "StorageSpaceAllocation/disk" },
  ];
  for (const { desc, type } of prefixTerminalCases) {
    it(`always-terminal: ${desc} (${type})`, () => {
      expect(evaluateStopRule(rule, { resourceType: type })).toBe(true);
    });
  }

  // isFinal=true conditional stops — StreamManager (and other container types)
  it("StreamManager + isFinal=true → stops", () => {
    expect(evaluateStopRule(rule, { resourceType: "StreamManager", isFinal: true })).toBe(true);
  });
  it("StreamManager + isFinal=false → continues", () => {
    expect(evaluateStopRule(rule, { resourceType: "StreamManager", isFinal: false })).toBe(false);
  });

  // isFinal=true conditional stops — container types (representative sample)
  it("StdMap + isFinal=true → stops", () => {
    expect(evaluateStopRule(rule, { resourceType: "StdMap", isFinal: true })).toBe(true);
  });
  it("StdMap + isFinal=false → continues", () => {
    expect(evaluateStopRule(rule, { resourceType: "StdMap", isFinal: false })).toBe(false);
  });
  it("BlockPackCustom + isFinal=true → stops", () => {
    expect(evaluateStopRule(rule, { resourceType: "BlockPackCustom", isFinal: true })).toBe(true);
  });
  it("BlockPackCustom + isFinal=false → continues", () => {
    expect(evaluateStopRule(rule, { resourceType: "BlockPackCustom", isFinal: false })).toBe(false);
  });

  // isFinal=true conditional stops — json/resourceError
  it("json/resourceError + isFinal=true → stops", () => {
    expect(evaluateStopRule(rule, { resourceType: "json/resourceError", isFinal: true })).toBe(true);
  });
  it("json/resourceError + isFinal=false → continues", () => {
    expect(evaluateStopRule(rule, { resourceType: "json/resourceError", isFinal: false })).toBe(false);
  });

  it("PColumnData/Int32 + isFinal=true → stops", () => {
    expect(evaluateStopRule(rule, { resourceType: "PColumnData/Int32", isFinal: true })).toBe(true);
  });
  it("PColumnData/Int32 + isFinal=false → continues", () => {
    expect(evaluateStopRule(rule, { resourceType: "PColumnData/Int32", isFinal: false })).toBe(false);
  });

  it("StreamWorkdir/run-42 + isFinal=true → stops", () => {
    expect(evaluateStopRule(rule, { resourceType: "StreamWorkdir/run-42", isFinal: true })).toBe(true);
  });
  it("StreamWorkdir/run-42 + isFinal=false → continues", () => {
    expect(evaluateStopRule(rule, { resourceType: "StreamWorkdir/run-42", isFinal: false })).toBe(false);
  });

  // isFinal + allOutputsFinal stops
  it("BlobUpload/v1 + isFinal=true + allOutputsFinal=true → stops", () => {
    expect(
      evaluateStopRule(rule, { resourceType: "BlobUpload/v1", isFinal: true, allOutputsFinal: true }),
    ).toBe(true);
  });
  it("BlobUpload/v1 + isFinal=false → continues", () => {
    expect(
      evaluateStopRule(rule, { resourceType: "BlobUpload/v1", isFinal: false, allOutputsFinal: true }),
    ).toBe(false);
  });
  it("BlobUpload/v1 + isFinal=true but allOutputsFinal=false → continues", () => {
    expect(
      evaluateStopRule(rule, { resourceType: "BlobUpload/v1", isFinal: true, allOutputsFinal: false }),
    ).toBe(false);
  });

  it("BlobIndex/v2 + isFinal=true + allOutputsFinal=true → stops", () => {
    expect(
      evaluateStopRule(rule, { resourceType: "BlobIndex/v2", isFinal: true, allOutputsFinal: true }),
    ).toBe(true);
  });

  // Non-matching type — traversal continues
  it("arbitrary type SomeStructure → does not stop", () => {
    expect(evaluateStopRule(rule, { resourceType: "SomeStructure" })).toBe(false);
  });
  it("UserProject → does not stop", () => {
    expect(evaluateStopRule(rule, { resourceType: "UserProject" })).toBe(false);
  });
  it("Projects → does not stop", () => {
    expect(evaluateStopRule(rule, { resourceType: "Projects" })).toBe(false);
  });
});

// ── §4.3 — Final-predicate parity ────────────────────────────────────────────
//
// For each case we assert:
//   1. DefaultFinalResourceDataPredicate(resource) === expectedPredicate
//   2. evaluateStopRule(rule, flags) === expectedStop
//
// `flags` encodes what the backend would emit for the same resource state:
//   - isFinal   = resource is "ready/error/duplicate" (or always-final type)
//   - allOutputsFinal = outputsLocked && every field value is final
//
// The parity contract: when the predicate says "final" AND the type is one the
// stop rule covers, the stop rule must also fire.  Types that are final only due
// to runtime state (StdMap, BlockPackCustom, …) are NOT in the stop rules —
// those are left to the backend's own isFinal flag (`item.final`) and are
// documented as intentional gaps below.

describe("§4.3 final-predicate parity: DefaultFinalResourceDataPredicate ⇄ projectTreeTraverseStopRules", () => {
  const rule = projectTreeTraverseStopRules();

  // ── Group A: Always-terminal (predicate=true always; stop fires regardless of isFinal) ──

  const alwaysTerminal: Array<{ typeName: string; version?: string }> = [
    { typeName: "json/object" },
    { typeName: "json-gz/object" },
    { typeName: "json/string" },
    { typeName: "json/array" },
    { typeName: "json/number" },
    { typeName: "binary" },
    { typeName: "Frontend/FromUrl" },
    { typeName: "Frontend/FromFolder" },
    { typeName: "BObjectSpec" },
    { typeName: "BContextEnd" },
    { typeName: "Null" },
    { typeName: "LSProvider" },
    { typeName: "Blob" },
    { typeName: "Blob/v2" },
    { typeName: "LS/remote" },
    { typeName: "WorkingDirectory/1" },
    { typeName: "StorageSpaceAllocation/disk" },
  ];

  for (const { typeName, version } of alwaysTerminal) {
    it(`${typeName}: predicate=true, stop fires (even isFinal=false)`, () => {
      const r = version
        ? { ...makeResource(typeName, []), type: { name: typeName, version } }
        : makeResource(typeName, []);
      expect(DefaultFinalResourceDataPredicate(r as any)).toBe(true);
      // stop rule fires unconditionally for these types
      expect(evaluateStopRule(rule, { resourceType: typeName, isFinal: false })).toBe(true);
    });
  }

  // ── Group B: isFinal-conditional — readyOrDuplicateOrError maps to isFinal ──

  it("StreamManager — ready resource (fields=undefined): predicate=true, stop fires with isFinal=true", () => {
    // fields=undefined triggers the early-return path in the predicate (no getField call needed)
    const r = { ...makeReadyResource("StreamManager"), fields: undefined };
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(true);
    expect(evaluateStopRule(rule, { resourceType: "StreamManager", isFinal: true })).toBe(true);
  });

  it("StreamManager — not-ready resource: predicate=false, stop does NOT fire with isFinal=false", () => {
    const r = makeResource("StreamManager", []);
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(false);
    expect(evaluateStopRule(rule, { resourceType: "StreamManager", isFinal: false })).toBe(false);
  });

  it("StdMap — ready resource: predicate=true, stop fires with isFinal=true", () => {
    const r = makeReadyResource("StdMap");
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(true);
    expect(evaluateStopRule(rule, { resourceType: "StdMap", isFinal: true })).toBe(true);
  });

  it("StdMap — not-ready resource: predicate=false, stop does NOT fire with isFinal=false", () => {
    const r = makeResource("StdMap", []);
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(false);
    expect(evaluateStopRule(rule, { resourceType: "StdMap", isFinal: false })).toBe(false);
  });

  it("BlockPackCustom — ready resource: predicate=true, stop fires with isFinal=true", () => {
    const r = makeReadyResource("BlockPackCustom");
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(true);
    expect(evaluateStopRule(rule, { resourceType: "BlockPackCustom", isFinal: true })).toBe(true);
  });

  it("BlockPackCustom — not-ready resource: predicate=false, stop does NOT fire with isFinal=false", () => {
    const r = makeResource("BlockPackCustom", []);
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(false);
    expect(evaluateStopRule(rule, { resourceType: "BlockPackCustom", isFinal: false })).toBe(false);
  });

  it("PColumnData/Int32 — ready resource: predicate=true, stop fires with isFinal=true", () => {
    const r = makeReadyResource("PColumnData/Int32");
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(true);
    expect(evaluateStopRule(rule, { resourceType: "PColumnData/Int32", isFinal: true })).toBe(true);
  });

  it("PColumnData/Int32 — not-ready resource: predicate=false, stop does NOT fire with isFinal=false", () => {
    const r = makeResource("PColumnData/Int32", []);
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(false);
    expect(evaluateStopRule(rule, { resourceType: "PColumnData/Int32", isFinal: false })).toBe(false);
  });

  it("StreamWorkdir/run-42 — ready resource: predicate=true, stop fires with isFinal=true", () => {
    const r = makeReadyResource("StreamWorkdir/run-42");
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(true);
    expect(evaluateStopRule(rule, { resourceType: "StreamWorkdir/run-42", isFinal: true })).toBe(true);
  });

  it("StreamWorkdir/run-42 — not-ready: predicate=false, stop does NOT fire with isFinal=false", () => {
    const r = makeResource("StreamWorkdir/run-42", []);
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(false);
    expect(evaluateStopRule(rule, { resourceType: "StreamWorkdir/run-42", isFinal: false })).toBe(false);
  });

  // ── Group C: isFinal+allOutputsFinal-conditional — readyAndHasAllOutputsFilled ──

  it("BlobUpload/v1 — all outputs final: predicate=true, stop fires with isFinal+allOutputsFinal=true", () => {
    const r = makeAllOutputsFinalResource("BlobUpload/v1");
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(true);
    expect(
      evaluateStopRule(rule, { resourceType: "BlobUpload/v1", isFinal: true, allOutputsFinal: true }),
    ).toBe(true);
  });

  it("BlobUpload/v1 — not ready: predicate=false, stop does NOT fire with isFinal=false", () => {
    const r = makeResource("BlobUpload/v1", []);
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(false);
    expect(
      evaluateStopRule(rule, { resourceType: "BlobUpload/v1", isFinal: false, allOutputsFinal: false }),
    ).toBe(false);
  });

  it("BlobIndex/v2 — all outputs final: predicate=true, stop fires with isFinal+allOutputsFinal=true", () => {
    const r = makeAllOutputsFinalResource("BlobIndex/v2");
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(true);
    expect(
      evaluateStopRule(rule, { resourceType: "BlobIndex/v2", isFinal: true, allOutputsFinal: true }),
    ).toBe(true);
  });

  // ── Group D: json/resourceError — final for version "1" only ──

  it("json/resourceError v1: predicate=true (version check), stop fires with isFinal=true", () => {
    const r = makeReadyResource("json/resourceError", "1");
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(true);
    expect(evaluateStopRule(rule, { resourceType: "json/resourceError", isFinal: true })).toBe(true);
  });

  it("json/resourceError v2: predicate=false (version check), stop does NOT fire with isFinal=false", () => {
    const r = { ...makeResource("json/resourceError", []), type: { name: "json/resourceError", version: "2" } };
    expect(DefaultFinalResourceDataPredicate(r as any)).toBe(false);
    expect(evaluateStopRule(rule, { resourceType: "json/resourceError", isFinal: false })).toBe(false);
  });

  // ── Group E: never-final types — predicate=false, stop rule does not fire ──
  //
  // Covers the explicit `return false` cases in DefaultFinalResourceDataPredicate
  // (UserProject, Projects, ClientRoot) and the `default` else-branch for unknown
  // types.  Both paths agree: not final, traversal continues.

  const neverFinalCases: Array<{ typeName: string; label: string }> = [
    { typeName: "UserProject", label: "explicit false in predicate" },
    { typeName: "Projects", label: "explicit false in predicate" },
    { typeName: "ClientRoot", label: "explicit false in predicate" },
    { typeName: "SomeUnknownType", label: "default branch else → false" },
  ];

  for (const { typeName, label } of neverFinalCases) {
    it(`${typeName} (${label}): predicate=false, stop does NOT fire`, () => {
      const r = makeResource(typeName, []);
      expect(DefaultFinalResourceDataPredicate(r as any)).toBe(false);
      expect(evaluateStopRule(rule, { resourceType: typeName, isFinal: false })).toBe(false);
    });
  }
});
