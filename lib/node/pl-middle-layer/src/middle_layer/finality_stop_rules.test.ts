import { describe, expect, test } from "vitest";
import type { FieldData, Filter, FinalityEntry, ResourceData } from "@milaboratories/pl-client";
import {
  CacheFinality,
  createSignedResourceId,
  FilterOperatorType,
  FilterProperty,
  FinalityTable,
  NullSignedResourceId,
  ResourceTypeName,
  ResourceTypePrefix,
  StrictFinality,
  TreeFinality,
  treeFilter,
} from "@milaboratories/pl-client";
import { finalityStopRuleClause, finalityStopRules } from "./finality_stop_rules";

import { projectTreeTraverseStopRules } from "./project";

/** Expected clauses of the project tree's stop rules, listed independently of the table. */
function expectedStopRules(): Filter {
  return treeFilter.or(
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.StreamManager),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.StdMap),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.StdMapSlash),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.EphStdMap),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.PFrame),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.ParquetChunk),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BContext),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BlockPackCustom),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BinaryMap),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BinaryValue),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BlobMap),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BResolveSingleNoResult),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BQueryResult),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.TengoTemplate),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.TengoLib),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.SoftwareInfo),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.Dummy),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonResourceError),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonObject),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonGzObject),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonString),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonArray),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonNumber),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonBool),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonNull),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonErrorTrace),
    treeFilter.resourceTypeEq(ResourceTypeName.BContextEnd),
    treeFilter.resourceTypeEq(ResourceTypeName.FrontendFromUrl),
    treeFilter.resourceTypeEq(ResourceTypeName.FrontendFromFolder),
    treeFilter.resourceTypeEq(ResourceTypeName.FrontendFromLocalTgz),
    treeFilter.resourceTypeEq(ResourceTypeName.BObjectSpec),
    treeFilter.resourceTypeEq(ResourceTypeName.Blob),
    treeFilter.resourceTypeEq(ResourceTypeName.Null),
    treeFilter.resourceTypeEq(ResourceTypeName.Binary),
    treeFilter.resourceTypeEq(ResourceTypeName.WorkingDirectory),
    treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.Blob),
    treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.LS),
    treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.WorkingDirectory),
    treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.StorageSpaceAllocation),
    treeFilter.and(
      treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.BlobUpload),
      treeFilter.readyOrDuplicateOrError(),
      treeFilter.outputsLocked(true),
      treeFilter.allOutputsFinal(true),
    ),
    treeFilter.and(
      treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.BlobIndex),
      treeFilter.readyOrDuplicateOrError(),
      treeFilter.outputsLocked(true),
      treeFilter.allOutputsFinal(true),
    ),
    treeFilter.and(
      treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.PColumnData),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.StreamWorkdir),
      treeFilter.readyOrDuplicateOrError(),
    ),
  );
}

function clauses(f: Filter): string[] {
  if (f.value.oneofKind !== "filtersValue") throw new Error("expected a group filter");
  return f.value.filtersValue.filters.map((c) => JSON.stringify(c)).sort();
}

describe("the project tree's stop rules come from TreeFinality", () => {
  test("project stop rules contain the declared clause of every built-in type", () => {
    const resolverAndCopyClauses = [
      treeFilter.and(
        treeFilter.resourceTypeEq(ResourceTypeName.BResolveSingle),
        treeFilter.readyOrDuplicateOrError(),
        treeFilter.outputsLocked(true),
        treeFilter.allOutputsFinal(true),
      ),
      treeFilter.and(
        treeFilter.resourceTypeEq(ResourceTypeName.BResolveChoice),
        treeFilter.readyOrDuplicateOrError(),
        treeFilter.outputsLocked(true),
        treeFilter.allOutputsFinal(true),
      ),
      treeFilter.and(
        treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.BlobCopy),
        treeFilter.readyOrDuplicateOrError(),
        treeFilter.outputsLocked(true),
        treeFilter.allOutputsFinal(true),
      ),
    ];
    const expected = [
      ...clauses(expectedStopRules()),
      ...resolverAndCopyClauses.map((c) => JSON.stringify(c)),
    ];
    expect(clauses(projectTreeTraverseStopRules())).toEqual(expected.sort());
  });

  test("an entry that is never final sends no stop rule", () => {
    for (const e of TreeFinality.entries)
      if (e.rule === "never") expect(finalityStopRuleClause(e)).toBeUndefined();
  });

  test("an approximated entry stops on its declared condition", () => {
    const exact = TreeFinality.entries.find((e) => e.rule === "readyAndAllOutputsFilled");
    expect(exact).toBeDefined();
    const match = exact!.match;
    expect(finalityStopRuleClause(exact!)).toEqual(
      treeFilter.and(
        "name" in match
          ? treeFilter.resourceTypeEq(match.name)
          : treeFilter.resourceTypeMatch("^" + match.prefix),
        treeFilter.readyOrDuplicateOrError(),
        treeFilter.outputsLocked(true),
        treeFilter.allOutputsFinal(true),
      ),
    );
  });

  test("a prefix is matched literally", () => {
    const f = finalityStopRules(
      TreeFinality.extend("probe", [{ match: { prefix: "A.B/" }, rule: "always", why: "test" }]),
    );
    expect(JSON.stringify(f)).toContain(JSON.stringify("^A\\.B/"));
  });
});

const target = createSignedResourceId(201n);
const failure = createSignedResourceId(202n);
function field(patch: Partial<FieldData> = {}): FieldData {
  return {
    name: "result",
    type: "Output",
    status: "Resolved",
    value: target,
    error: NullSignedResourceId,
    valueIsFinal: true,
    ...patch,
  };
}
function resource(name: string, patch: Partial<ResourceData> = {}): ResourceData {
  return {
    id: createSignedResourceId(203n),
    type: { name, version: "1" },
    kind: "Structural",
    data: undefined,
    originalResourceId: NullSignedResourceId,
    error: NullSignedResourceId,
    inputsLocked: true,
    outputsLocked: true,
    resourceReady: true,
    final: false,
    fields: [field()],
    ...patch,
  };
}
function nameOf(e: FinalityEntry): string {
  return "name" in e.match ? e.match.name : e.match.prefix + "probe";
}

/** A stop rule evaluated the way the backend does (core/pl tx_tree_iterator.go,
 * evalTraverseStopRules): ALL_OUTPUTS_FINAL holds when every retained field has an error or a final
 * value; HAS_ERRORS holds when the resource or any of its fields has an error. */
function evaluate(f: Filter, r: ResourceData): boolean {
  if (f.value.oneofKind === "filtersValue") {
    const children = f.value.filtersValue.filters;
    if (f.operator === FilterOperatorType.AND) return children.every((c) => evaluate(c, r));
    if (f.operator === FilterOperatorType.OR) return children.some((c) => evaluate(c, r));
    if (f.operator === FilterOperatorType.NOT) return !evaluate(children[0]!, r);
  }
  if (f.value.oneofKind === "stringValue" && f.key === FilterProperty.RESOURCE_TYPE) {
    if (f.operator === FilterOperatorType.EQUAL) return r.type.name === f.value.stringValue;
    if (f.operator === FilterOperatorType.MATCH)
      return new RegExp(f.value.stringValue).test(r.type.name);
  }
  if (f.value.oneofKind === "boolValue" && f.operator === FilterOperatorType.EQUAL) {
    let actual: boolean;
    switch (f.key) {
      case FilterProperty.RESOURCE_READY_FOR_CALCULATION:
        actual = r.resourceReady;
        break;
      case FilterProperty.IS_DUPLICATE:
        actual = r.originalResourceId !== NullSignedResourceId;
        break;
      case FilterProperty.HAS_ERRORS:
        actual =
          r.error !== NullSignedResourceId ||
          r.fields.some((v) => v.error !== NullSignedResourceId);
        break;
      case FilterProperty.OUTPUTS_LOCKED:
        actual = r.outputsLocked;
        break;
      case FilterProperty.ALL_OUTPUTS_FINAL:
        actual = r.fields.every((v) => v.error !== NullSignedResourceId || v.valueIsFinal);
        break;
      default:
        throw new Error(`unhandled boolean property ${f.key}`);
    }
    return actual === f.value.boolValue;
  }
  throw new Error(`unhandled filter ${JSON.stringify(f)}`);
}

test("an entry declared exact stops exactly where its predicate is final", () => {
  const rules = finalityStopRules(TreeFinality);
  const approximateNames = new Set(
    TreeFinality.entries
      .filter((e) => e.stopRule !== undefined && e.stopRule !== "exact")
      .map(nameOf),
  );
  const names = [
    ...new Set(
      TreeFinality.entries.flatMap((e) =>
        "name" in e.match
          ? [e.match.name]
          : [e.match.prefix, e.match.prefix + "probe", e.match.prefix + "BlobCopy/nested"],
      ),
    ),
  ];
  for (const name of names) {
    if (approximateNames.has(name)) continue;
    for (const version of ["", "1", "2"])
      for (let bits = 0; bits < 16; bits++) {
        for (const fields of [
          [],
          [field()],
          [field({ valueIsFinal: false })],
          [field({ value: NullSignedResourceId, valueIsFinal: false })],
        ]) {
          const r = resource(name, {
            type: { name, version },
            resourceReady: !!(bits & 1),
            outputsLocked: !!(bits & 2),
            originalResourceId: bits & 4 ? target : NullSignedResourceId,
            error: bits & 8 ? failure : NullSignedResourceId,
            fields,
          });
          expect(evaluate(rules, r), `${name}:${version}, state ${bits}`).toBe(
            TreeFinality.isFinal(r),
          );
        }
      }
  }
});

test("an unresolved Service field keeps a resolver or copy from both the filter's stop and finality", () => {
  const rules = finalityStopRules(TreeFinality);
  for (const name of ["BResolveSingle", "BResolveChoice", "BlobCopy/aToB"]) {
    const r = resource(name, {
      fields: [
        field(),
        field({
          name: "service",
          type: "Service",
          status: "Empty",
          value: NullSignedResourceId,
          valueIsFinal: false,
        }),
      ],
    });
    expect(TreeFinality.isFinal(r), name).toBe(false);
    expect(evaluate(rules, r), name).toBe(false);
  }
});

test("an error on a field alone: every ready-or-error clause stops early, as declared", () => {
  for (const e of TreeFinality.entries) {
    if (e.rule !== "readyOrDuplicateOrError" && e.rule !== "readyAndAllOutputsFilled") continue;
    const name = nameOf(e);
    expect(e.stopRule, name).toMatchObject({ approx: e.rule });
    const r = resource(name, {
      resourceReady: false,
      fields: [
        field(),
        field({
          name: "input",
          type: "Input",
          value: NullSignedResourceId,
          valueIsFinal: false,
          error: failure,
        }),
      ],
    });
    expect(TreeFinality.isFinal(r), name).toBe(false);
    expect(evaluate(finalityStopRuleClause(e)!, r), name).toBe(true);
  }
});

test("stop rules follow the layers: an inherited never neither hides nor revokes a child's entry", () => {
  const table = FinalityTable.of("base", [
    { match: { name: "A.B/child" }, rule: "never", why: "probe" },
  ])
    .extend("allow", [{ match: { prefix: "A.B/" }, rule: "always", why: "probe" }])
    .extend("cannot revoke", [{ match: { prefix: "A.B/" }, rule: "never", why: "probe" }]);
  const rules = finalityStopRules(table);
  for (const name of ["A.B/child", "A.B/", "AXB/child", "A.B", "xA.B/child"]) {
    const expected = name.startsWith("A.B/");
    expect(table.isFinal(resource(name))).toBe(expected);
    expect(evaluate(rules, resource(name))).toBe(expected);
  }
  for (const layer of [StrictFinality, CacheFinality, TreeFinality]) {
    for (const name of [
      "Blob",
      "Blob/fs",
      "BlobIndex/fs",
      "BlobUpload/fs",
      "BlobCopy/fs",
      "WorkingDirectory",
    ]) {
      expect(evaluate(finalityStopRules(layer), resource(name)), `${layer.name}:${name}`).toBe(
        layer.isFinal(resource(name)),
      );
    }
  }
});
