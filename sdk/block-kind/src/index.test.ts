import { expect, expectTypeOf, test } from "vitest";
import type { PlRef } from "@milaboratories/pl-model-common";
import { defineBlockKind, type InferBlockParams } from "./index";

test("InferBlockParams recovers the declared params", () => {
  // Identity is the `{ name, version }` the caller passes — a real kind sources
  // these from its own package.json (`import { name, version } from
  // "../package.json"`), so the descriptor cannot drift from what npm publishes.
  const k = defineBlockKind<{ ref: PlRef; n: number }>({
    name: "@platforma-open/milaboratories.demo.kind",
    version: "1.0.0",
    parseInitializationParams: (v) => v as { ref: PlRef; n: number },
  });

  expect(k.kindSchema).toBe("v1");
  expect(k.name).toBe("@platforma-open/milaboratories.demo.kind");
  expect(k.version).toBe("1.0.0");
  // Carried through, not dropped: a kind ships this check, so a descriptor without one
  // would leave template params unvalidated at the only point that can catch them.
  expect(typeof k.parseInitializationParams).toBe("function");

  // Locks the contract the future init/create wiring relies on.
  expectTypeOf<InferBlockParams<typeof k>>().toEqualTypeOf<{
    ref: PlRef;
    n: number;
  }>();
});

test("kinds with wider params are not assignable to narrower ones", () => {
  type Wide = InferBlockParams<ReturnType<typeof defineBlockKind<{ ref: PlRef; k: number }>>>;
  type Narrow = InferBlockParams<ReturnType<typeof defineBlockKind<{ ref: PlRef }>>>;

  // Contravariant phantom slot blocks silent widening between param shapes.
  expectTypeOf<Wide>().not.toEqualTypeOf<Narrow>();
});
