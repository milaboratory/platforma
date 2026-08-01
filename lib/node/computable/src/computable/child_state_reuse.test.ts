import { test, expect } from "vitest";
import { FakeTreeDriver } from "./test_backend";
import { Computable } from "./computable";

/**
 * Child state must be reused across a parent's re-render when the child carries a stable
 * `ops.key`.
 *
 * Callers rely on this for more than correctness: a parent whose body reconstructs its children
 * on every render (as the project overview does, one child per block) would otherwise re-invoke
 * every child body whenever anything the parent reads changes. Those bodies can be arbitrarily
 * expensive — in the middle layer each one spins up a QuickJS runtime and parses a block bundle —
 * so a regression here is a large, silent performance loss rather than a visible failure. Hence
 * these cover the shapes real callers use: plain and error-wrapped children, children with and
 * without `postprocessValue`, and a parent wrapped in `withPreCalculatedValueTree()`.
 */

function makeSetup(variant: "plain" | "wrapped") {
  const tree = new FakeTreeDriver();
  tree.writer.getOrCreateChild("trigger").setValue("t0");
  tree.writer.getOrCreateChild("childDep").setValue("c0");

  let childBodyInvocations = 0;
  let parentBodyInvocations = 0;

  const parent = Computable.make(
    (ctx) => {
      parentBodyInvocations++;
      // parent depends only on `trigger`
      const trigger = ctx.accessor(tree.accessor).get("trigger")?.getValue();

      // child rebuilt every parent render, stable key — exactly the overview's pattern
      const child = Computable.make(
        (childCtx) => {
          childBodyInvocations++;
          return childCtx.accessor(tree.accessor).get("childDep")?.getValue();
        },
        { key: "stable-child-key" },
      );

      return {
        trigger,
        child: variant === "wrapped" ? child.wrap({ recover: () => undefined }) : child,
      };
    },
    { key: "stable-parent-key" },
  );

  return {
    tree,
    parent,
    counts: () => ({ child: childBodyInvocations, parent: parentBodyInvocations }),
  };
}

test.each(["plain", "wrapped"] as const)(
  "child state with a stable key is reused across parent re-renders (%s child)",
  async (variant) => {
    const { tree, parent, counts } = makeSetup(variant);

    expect(await parent.getValue()).toEqual({ trigger: "t0", child: "c0" });
    expect(counts()).toEqual({ parent: 1, child: 1 });

    // change only what the parent reads; the child's dependency is untouched
    tree.writer.getOrCreateChild("trigger").setValue("t1");
    expect(await parent.getValue()).toEqual({ trigger: "t1", child: "c0" });

    expect(counts().parent).toBe(2);
    expect(counts().child).toBe(1); // <-- the claim under test

    // and again, to be sure it is not a one-off
    tree.writer.getOrCreateChild("trigger").setValue("t2");
    expect(await parent.getValue()).toEqual({ trigger: "t2", child: "c0" });
    expect(counts().child).toBe(1);

    // a change the child *does* depend on must still reach it
    tree.writer.getOrCreateChild("childDep").setValue("c1");
    expect(await parent.getValue()).toEqual({ trigger: "t2", child: "c1" });
    expect(counts().child).toBe(2);
  },
);

/**
 * `computableFromRF` builds its children with `makeRaw`, not `make` — returning `{ ir }` on the
 * synchronous path and `{ ir, postprocessValue }` when the lambda requested external data.
 * Both shapes are covered here because the overview's lambdas take the first and the block
 * outputs take the second.
 */
test.each(["ir-only", "with-postprocess"] as const)(
  "makeRaw child with a stable key is reused across parent re-renders (%s)",
  async (shape) => {
    const tree = new FakeTreeDriver();
    tree.writer.getOrCreateChild("trigger").setValue("t0");
    tree.writer.getOrCreateChild("childDep").setValue("c0");

    let childBodyInvocations = 0;

    const parent = Computable.make(
      (ctx) => {
        const trigger = ctx.accessor(tree.accessor).get("trigger")?.getValue();
        const child = Computable.makeRaw(
          (childCtx) => {
            childBodyInvocations++;
            const v = childCtx.accessor(tree.accessor).get("childDep")?.getValue();
            if (shape === "ir-only") return { ir: v };
            return { ir: v, postprocessValue: (resolved: unknown) => resolved };
          },
          { key: "stable-child-key" },
        );
        return { trigger, child };
      },
      { key: "stable-parent-key" },
    );

    expect(await parent.getValue()).toEqual({ trigger: "t0", child: "c0" });
    expect(childBodyInvocations).toBe(1);

    tree.writer.getOrCreateChild("trigger").setValue("t1");
    expect(await parent.getValue()).toEqual({ trigger: "t1", child: "c0" });
    expect(childBodyInvocations).toBe(1);
  },
);

test("same, with the parent wrapped in withPreCalculatedValueTree (as Project does)", async () => {
  const tree = new FakeTreeDriver();
  tree.writer.getOrCreateChild("trigger").setValue("t0");
  tree.writer.getOrCreateChild("childDep").setValue("c0");

  let childBodyInvocations = 0;

  const parent = Computable.make(
    (ctx) => {
      const trigger = ctx.accessor(tree.accessor).get("trigger")?.getValue();
      const child = Computable.make(
        (childCtx) => {
          childBodyInvocations++;
          return childCtx.accessor(tree.accessor).get("childDep")?.getValue();
        },
        { key: "stable-child-key" },
      );
      return { trigger, child };
    },
    { key: "stable-parent-key" },
  ).withPreCalculatedValueTree();

  expect(await parent.getValue()).toEqual({ trigger: "t0", child: "c0" });
  expect(childBodyInvocations).toBe(1);

  tree.writer.getOrCreateChild("trigger").setValue("t1");
  expect(await parent.getValue()).toEqual({ trigger: "t1", child: "c0" });
  expect(childBodyInvocations).toBe(1);
});
