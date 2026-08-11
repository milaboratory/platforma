import { describe, expect, test } from "vitest";
import canonicalize from "canonicalize";
import type {
  BlockKindReference,
  BlockKindSelectorReference,
  ProjectTemplateV1,
} from "@milaboratories/pl-model-common";
import {
  PROJECT_TEMPLATE_SCHEMA_V1,
  createTemplateLocalRef,
} from "@milaboratories/pl-model-common";
import type { ProjectStructure } from "./project_model";
import type { TemplateExportEntry, TemplateParamsResult } from "./template_export";
import { walkProjectForTemplateExport } from "./template_export";
import { assembleProjectTemplateV1, stringifyProjectTemplateV1 } from "./template_serializer";
import { parseProjectTemplateV1Yaml } from "./template_parser";
import { validateTemplateV1ForApply } from "./template_validate";

/**
 * BUG DEMO — export and import disagree about a block id inside a column id.
 *
 * Export tests MEMBERSHIP: a block id found in template-form params is a fault only if
 * the document does not describe that block (`unrewrittenBlockIds`, template_export.ts).
 * Import tests PRESENCE, subtracting nothing (`foreignBlockIds`, template_validate.ts).
 *
 * So a project whose params carry a PColumn id exports cleanly and is refused on import.
 * That is the motivating case of the commit "remap the block ids buried inside a column
 * id", whose message reads: "clonotype-browser's annotation filters reference result-pool
 * columns. This is not hypothetical."
 *
 * These tests drive the REAL exporter and the REAL validator back to back — no mocks of
 * either side.
 */

const KIND = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;

function simpleStructure(...ids: string[]): ProjectStructure {
  return {
    groups: [
      {
        id: "g1",
        label: "G1",
        blocks: ids.map((id) => ({ id, label: id, renderingMode: "Heavy" })),
      },
    ],
  };
}

function providerFrom(params: Record<string, TemplateParamsResult>) {
  return (blockId: string): TemplateParamsResult | undefined => params[blockId];
}

const ok = (value: unknown): TemplateParamsResult => ({ value });

/**
 * A PColumn id as it actually appears in params: a canonicalized-JSON string embedding
 * `{ __isRef: true, blockId, name }`. It has to keep that shape or it stops being a
 * column id a block can resolve.
 */
const columnIdNaming = (blockId: string, name: string): string =>
  canonicalize({ __isRef: true, blockId, name })!;

/** Turn what the exporter produced into the document the importer would be handed. */
function documentFromWalk(entries: readonly TemplateExportEntry[]) {
  return {
    schema: PROJECT_TEMPLATE_SCHEMA_V1,
    blocks: entries.map((e) => ({ id: e.blockId, kind: KIND, params: e.params })),
  } as ProjectTemplateV1;
}

describe("export → import asymmetry", () => {
  test("CONTROL: a plain template-local reference survives the trip", () => {
    // Establishes that the harness is sound and the round trip works in general.
    const walk = walkProjectForTemplateExport(
      simpleStructure("a", "b"),
      providerFrom({
        a: ok({}),
        b: ok({ input: createTemplateLocalRef("a", "reads") }),
      }),
    );

    expect(walk.problems).toEqual([]);
    expect(validateTemplateV1ForApply(documentFromWalk(walk.entries))).toEqual([]);
  });

  test("BUG: a column id naming an in-document entry exports, then is refused on import", () => {
    const anchor = columnIdNaming("a", "clonotypes");

    const walk = walkProjectForTemplateExport(
      simpleStructure("a", "b"),
      providerFrom({ a: ok({}), b: ok({ anchor }) }),
    );

    // Export accepts it — deliberately. Its own suite asserts this exact case is legal:
    // "a column id naming a block the template describes is a wire, not a fault".
    expect(walk.problems).toEqual([]);

    // The importer is handed precisely what the exporter just produced. It should accept
    // it. It does not — this is the bug.
    expect(validateTemplateV1ForApply(documentFromWalk(walk.entries))).toEqual([]);
  });

  test("BUG, at file level: the real YAML a real export writes cannot be re-imported", () => {
    // Same case, but through the ENTIRE shipped pipeline rather than just the walk:
    // assemble → stringify to YAML → parse the YAML back → validate for apply.
    // This rules out "some later export stage would have caught it" and shows the
    // artifact a user actually holds — a .yaml file on disk — is the thing refused.
    const anchor = columnIdNaming("a", "clonotypes");

    const walk = walkProjectForTemplateExport(
      simpleStructure("a", "b"),
      providerFrom({ a: ok({}), b: ok({ anchor }) }),
    );

    const assembled = assembleProjectTemplateV1(
      walk,
      () => "@platforma-open/milaboratories.demo.kind@1.0.0" as BlockKindReference,
      // A registry block, so the emitted entry stays portable — no `location`.
      (blockId) => ({
        type: "from-registry-v2",
        registryUrl: "https://block.registry.platforma.bio/releases",
        id: { organization: "milaboratories", name: blockId, version: "1.2.3" },
        channel: "stable",
      }),
    );

    // Export completes with no problems and produces a real file.
    expect(assembled.problems).toEqual([]);
    const yaml = stringifyProjectTemplateV1(assembled.document);
    console.log("exported template-v1 YAML:\n" + yaml);

    // The file parses cleanly — the format is not in question.
    const parsed = parseProjectTemplateV1Yaml(yaml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // ...and is then refused by the apply-time validator. This is the bug, at the level
    // the user experiences it: export succeeded, the file is well-formed, import says no.
    expect(validateTemplateV1ForApply(parsed.document)).toEqual([]);
  });

  test("DIAGNOSTIC: the exact refusal the importer produces", () => {
    const anchor = columnIdNaming("a", "clonotypes");
    const walk = walkProjectForTemplateExport(
      simpleStructure("a", "b"),
      providerFrom({ a: ok({}), b: ok({ anchor }) }),
    );

    const problems = validateTemplateV1ForApply(documentFromWalk(walk.entries));

    // Printed so the failure above is self-explanatory: the id it calls "from another
    // project" is `a`, which is the FIRST ENTRY OF THE SAME DOCUMENT.
    console.log("importer said:", JSON.stringify(problems, null, 2));

    expect(problems).toHaveLength(1);
    expect(problems[0]?.entryId).toBe("b");
    expect(problems[0]?.error).toMatch(/from another project/);
    // The offending id is an entry the document itself describes.
    expect(walk.entries.map((e) => e.blockId)).toContain("a");
  });
});
