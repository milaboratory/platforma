import { describe, expect, test } from "vitest";
import type { Filter } from "@milaboratories/pl-client";
import {
  ResourceTypeName,
  ResourceTypePrefix,
  TreeFinality,
  treeFilter,
} from "@milaboratories/pl-client";
import { finalityStopRuleClause, finalityStopRules } from "./finality_stop_rules";
import { projectTreeTraverseStopRules } from "./project";

/** The project tree's stop rules as they were written by hand, before they were generated. */
function handWrittenStopRules(): Filter {
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
  test("they are the hand-written rules plus the types the table made final", () => {
    const added = [
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
    const expected = [...clauses(handWrittenStopRules()), ...added.map((c) => JSON.stringify(c))];
    expect(clauses(projectTreeTraverseStopRules())).toEqual(expected.sort());
  });

  test("an entry that is never final sends no stop rule", () => {
    for (const e of TreeFinality.entries)
      if (e.rule === "never") expect(finalityStopRuleClause(e)).toBeUndefined();
  });

  test("an entry declared exact stops on its own rule", () => {
    const exact = TreeFinality.entries.find(
      (e) => e.rule === "readyAndAllOutputsFilled" && e.stopRule === undefined,
    );
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
