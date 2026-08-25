import { describe, expect, test } from "vitest";
import type {
  BlockKindSelectorReference,
  BlockPackLocationReference,
  ProjectTemplateV1,
  ProjectTemplateV1Entry,
} from "@milaboratories/pl-model-common";
import { PROJECT_TEMPLATE_SCHEMA_V1 } from "@milaboratories/pl-model-common";
import { unshareableTemplateEntries } from "./template_share";

/**
 * Whether a stored template may travel to another machine.
 *
 * A function of the document alone, which is why it is asked both when a share is attempted
 * and when a template is merely displayed — the refusal has to be visible on the template
 * itself, not only after the user tries.
 */

const KIND = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;

const entry = (id: string, location?: string): ProjectTemplateV1Entry => ({
  id,
  kind: KIND,
  params: {},
  ...(location !== undefined ? { location: location as BlockPackLocationReference } : {}),
});

const documentOf = (...blocks: ProjectTemplateV1Entry[]): ProjectTemplateV1 => ({
  schema: PROJECT_TEMPLATE_SCHEMA_V1,
  blocks,
});

describe("unshareableTemplateEntries", () => {
  test("a template whose entries name no place at all can be shared", () => {
    // The common case: every entry resolves through its kind, which means the same thing
    // on the recipient's machine as it does here.
    expect(unshareableTemplateEntries(documentOf(entry("a"), entry("b")))).toStrictEqual([]);
  });

  test("an entry installed from a folder on this machine refuses the share, and says which folder", () => {
    const problems = unshareableTemplateEntries(
      documentOf(entry("a"), entry("b", "file:///Users/dev/blocks/demo/block")),
    );

    expect(problems.map((p) => p.entryId)).toStrictEqual(["b"]);
    expect(problems[0].error).toContain("file:///Users/dev/blocks/demo/block");
  });

  test("every offending entry is reported, not only the first", () => {
    // A UI names each block once instead of sending its user round the loop per entry.
    const problems = unshareableTemplateEntries(
      documentOf(
        entry("a", "file:///blocks/a"),
        entry("b"),
        entry("c", "FILE:///blocks/c"), // the scheme is case-insensitive
      ),
    );

    expect(problems.map((p) => p.entryId)).toStrictEqual(["a", "c"]);
  });

  test("a location whose scheme cannot be read is refused too", () => {
    // Nothing can resolve it anywhere, here included — so the reason differs from the
    // `file:` one, and the message says so rather than blaming the recipient's machine.
    const problems = unshareableTemplateEntries(documentOf(entry("a", "/blocks/a")));

    expect(problems.map((p) => p.entryId)).toStrictEqual(["a"]);
    expect(problems[0].error).toContain("nothing can resolve");
  });

  test("a location naming a place both machines can reach is not refused", () => {
    // The rule is about a place that means something different elsewhere, not about
    // locations as such.
    expect(
      unshareableTemplateEntries(documentOf(entry("a", "https://blocks.example.org/demo"))),
    ).toStrictEqual([]);
  });
});
