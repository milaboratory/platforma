import { describe, expect, test } from "vitest";
import type { AddBlockOps, BlockPackSpecAny } from "@milaboratories/pl-middle-layer";
import {
  BlockInitParamsRejectedError,
  ModelAPIVersionMismatchError,
} from "@milaboratories/pl-errors";
import type { AddBlockDeps, AddBlockInput } from "./blocks";
import { addBlock } from "./blocks";

const devSpec: AddBlockInput["spec"] = { type: "dev-v2", folder: "/blocks/enter-numbers" };
const resolvedSpec: BlockPackSpecAny = {
  type: "from-registry-v2",
  registryUrl: "https://registry.test/",
  id: { organization: "org", name: "block", version: "1.2.3" },
};

type AddBlockCall = {
  label: string;
  spec: BlockPackSpecAny;
  before: string | undefined;
  ops: AddBlockOps | undefined;
};

/** Dependencies whose project records each addBlock call and answers with `outcome`. */
function depsRecording(outcome: () => string, resolved: BlockPackSpecAny = resolvedSpec) {
  const calls: AddBlockCall[] = [];
  const kinds: { kind: string; registryUrl: string | undefined; allowUnstable: boolean }[] = [];
  const deps: AddBlockDeps = {
    project: {
      addBlock: async (label, spec, before, _author, _blockId, ops) => {
        calls.push({ label, spec, before, ops });
        return outcome();
      },
    },
    resolveKind: async (kind, registryUrl, allowUnstable) => {
      kinds.push({ kind, registryUrl, allowUnstable });
      return resolved;
    },
    author: { authorId: "test", localVersion: 1 },
  };
  return { deps, calls, kinds };
}

function input(overrides: Partial<AddBlockInput> = {}): AddBlockInput {
  return { projectId: "project", label: "Block", spec: devSpec, ...overrides };
}

function textOf(result: Awaited<ReturnType<typeof addBlock>>): string {
  return result.content[0].text;
}

describe("add_block", () => {
  test("adds a block in its default state when no params are given", async () => {
    const { deps, calls } = depsRecording(() => "new-block");

    const result = await addBlock(deps, input());

    expect(JSON.parse(textOf(result))).toEqual({ blockId: "new-block" });
    expect(calls).toEqual([
      {
        label: "Block",
        spec: devSpec,
        before: undefined,
        ops: { init: undefined, requireModelAPIVersion: 2 },
      },
    ]);
  });

  test("passes params, block ids and position to the project", async () => {
    const { deps, calls } = depsRecording(() => "new-block");

    await addBlock(
      deps,
      input({ params: { numbers: [1] }, blockIds: { alias: "real" }, before: "other" }),
    );

    expect(calls[0].before).toBe("other");
    expect(calls[0].ops).toEqual({
      init: { params: { numbers: [1] }, blockIds: { alias: "real" } },
      requireModelAPIVersion: 2,
    });
  });

  test("adds the block a kind resolves to", async () => {
    const { deps, calls, kinds } = depsRecording(() => "new-block");

    await addBlock(deps, input({ spec: { type: "kind", kind: "@org/block.kind@1.0.0" } }));

    expect(kinds).toEqual([
      { kind: "@org/block.kind@1.0.0", registryUrl: undefined, allowUnstable: false },
    ]);
    expect(calls[0].spec).toEqual(resolvedSpec);
  });

  test("reports a kind that resolves to no block and adds nothing", async () => {
    const { deps, calls } = depsRecording(() => "new-block");
    deps.resolveKind = async () => {
      throw new Error("no-matching-kind-version");
    };

    const result = await addBlock(
      deps,
      input({ spec: { type: "kind", kind: "@org/block.kind@9.0.0" } }),
    );

    expect(result).toMatchObject({ isError: true });
    expect(textOf(result)).toContain("no-matching-kind-version");
    expect(textOf(result)).toContain("Nothing was created");
    expect(calls).toEqual([]);
  });

  test("reports a block on the legacy block API", async () => {
    const { deps } = depsRecording(() => {
      throw new ModelAPIVersionMismatchError("new-block", 2, 1);
    });

    const result = await addBlock(deps, input());

    expect(result).toMatchObject({ isError: true });
    expect(textOf(result)).toContain("legacy block API");
    expect(textOf(result)).toContain("Nothing was created");
  });

  test("reports params the block does not accept, in the block's words", async () => {
    const { deps } = depsRecording(() => {
      throw new BlockInitParamsRejectedError("'numbers' must be an array of numbers.");
    });

    const result = await addBlock(deps, input({ params: { numbers: "x" } }));

    expect(result).toMatchObject({ isError: true });
    expect(textOf(result)).toContain("'numbers' must be an array of numbers.");
    expect(textOf(result)).toContain("Nothing was created");
  });

  test("lets an unexpected failure through", async () => {
    const { deps } = depsRecording(() => {
      throw new Error("backend is down");
    });

    await expect(addBlock(deps, input())).rejects.toThrow("backend is down");
  });
});
