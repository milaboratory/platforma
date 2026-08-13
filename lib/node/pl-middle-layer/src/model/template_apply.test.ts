import { describe, expect, test } from "vitest";
import type {
  BlockKindSelectorReference,
  ProjectTemplateV1,
  ProjectTemplateV1Entry,
} from "@milaboratories/pl-model-common";
import {
  PROJECT_TEMPLATE_SCHEMA_V1,
  createPlRef,
  toTemplateRef,
} from "@milaboratories/pl-model-common";
import type { AddBlockRequest, TemplateApplyApi } from "./template_apply";
import { applyProjectTemplateV1 } from "./template_apply";

/**
 * The fixed orchestrator, driven against a recording API.
 *
 * A fake implementation is not a shortcut here — it is the point. If these tests
 * needed a project, a backend or a registry, the API would not be the narrow data
 * contract it claims to be, and a sandboxed orchestrator could not be handed one.
 */

const kind = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;

const entry = (id: string, params?: Record<string, unknown>): ProjectTemplateV1Entry => ({
  id,
  kind,
  ...(params !== undefined ? { params } : {}),
});

const documentOf = (...blocks: ProjectTemplateV1Entry[]): ProjectTemplateV1 => ({
  schema: PROJECT_TEMPLATE_SCHEMA_V1,
  blocks,
});

/**
 * Records every request and hands out predictable ids.
 *
 * @param failOn Template-local id to refuse, with the given reason
 */
function recordingApi(failOn?: { id: string; error: string }) {
  const requests: AddBlockRequest[] = [];
  const api: TemplateApplyApi = {
    addBlock: (request) => {
      requests.push(request);
      if (failOn !== undefined && request.id === failOn.id) {
        return { ok: false, error: failOn.error };
      }
      return { ok: true, blockId: `assigned-${requests.length}` };
    },
  };
  return { api, requests };
}

describe("applyProjectTemplateV1", () => {
  test("adds every entry, in file order", () => {
    // File order is instantiation order, so this is the one sequencing decision the
    // orchestrator makes and the only one it is allowed to make.
    const { api, requests } = recordingApi();

    const outcome = applyProjectTemplateV1(documentOf(entry("a"), entry("b"), entry("c")), api);

    expect(requests.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(outcome.problem).toBeUndefined();
  });

  test("reports the id each entry was given, paired with its file id", () => {
    // This pairing is what a caller needs to say what it built — and what an
    // implementation needs never to expose, since it assigns the ids itself.
    const { api } = recordingApi();

    const outcome = applyProjectTemplateV1(documentOf(entry("a"), entry("b")), api);

    expect(outcome.added).toEqual([
      { templateLocalId: "a", blockId: "assigned-1" },
      { templateLocalId: "b", blockId: "assigned-2" },
    ]);
  });

  test("params are handed over exactly as the file carries them", () => {
    // References are still wrapped here. The orchestrator must NOT redirect them: only the
    // implementation knows which project-local id each entry got, and a rewrite done twice,
    // or done differently by two orchestrators, is a silently mis-wired project.
    const params = {
      input: toTemplateRef(createPlRef("a", "reads")),
      nested: { deeper: [toTemplateRef(createPlRef("a", "spec"))] },
      species: "hsa",
    };
    const { api, requests } = recordingApi();

    applyProjectTemplateV1(documentOf(entry("a"), entry("b", params)), api);

    expect(requests[1].params).toEqual(params);
  });

  test("an entry with no params is asked for without any", () => {
    // The key travels exactly as the file wrote it — omitted stays omitted, `{}` stays
    // `{}`. Reading a missing key as `{}` belongs to the implementation, not this walk.
    const { api, requests } = recordingApi();

    applyProjectTemplateV1(documentOf(entry("a"), entry("b", {})), api);

    expect("params" in requests[0]).toBe(false);
    expect(requests[1].params).toEqual({});
  });

  test("stops at the first entry it cannot add", () => {
    // Everything after the failure may reference it, so continuing would place
    // blocks whose upstream is missing.
    const { api, requests } = recordingApi({ id: "b", error: "no such block version" });

    const outcome = applyProjectTemplateV1(
      documentOf(entry("a"), entry("b"), entry("c"), entry("d")),
      api,
    );

    expect(requests.map((r) => r.id)).toEqual(["a", "b"]);
    expect(outcome.problem).toEqual({ entryId: "b", error: "no such block version" });
  });

  test("keeps and reports what already landed when it stops", () => {
    // The partial project is kept deliberately: those blocks are valid, the user can
    // finish by hand, and the report is the only record of how far the apply got.
    const { api } = recordingApi({ id: "c", error: "params rejected" });

    const outcome = applyProjectTemplateV1(documentOf(entry("a"), entry("b"), entry("c")), api);

    expect(outcome.added).toEqual([
      { templateLocalId: "a", blockId: "assigned-1" },
      { templateLocalId: "b", blockId: "assigned-2" },
    ]);
  });

  test("a failure on the very first entry adds nothing", () => {
    const { api } = recordingApi({ id: "a", error: "nope" });

    const outcome = applyProjectTemplateV1(documentOf(entry("a")), api);

    expect(outcome).toEqual({ added: [], problem: { entryId: "a", error: "nope" } });
  });

  test("an empty document is a successful apply that adds nothing", () => {
    // An exported empty project round-trips to an empty project, not to a failure.
    const { api, requests } = recordingApi();

    expect(applyProjectTemplateV1(documentOf(), api)).toEqual({ added: [] });
    expect(requests).toHaveLength(0);
  });

  test("nothing but the entry's id and params crosses the API", () => {
    // The request shape is the contract's whole surface. A kind or block-pack field
    // leaking in would let an orchestrator choose an implementation the document was
    // never validated against.
    const { api, requests } = recordingApi();

    applyProjectTemplateV1(documentOf(entry("a", { x: 1 })), api);

    expect(Object.keys(requests[0]).sort()).toEqual(["id", "params"]);
  });
});
