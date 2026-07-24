import { expectTypeOf, test } from "vitest";
import { defineBlockKind, type InferBlockParams, type PlRef } from "./index";

test("InferBlockParams recovers the declared params", () => {
  const k = defineBlockKind<{ ref: PlRef; n: number }>({
    name: "@platforma-open/milaboratories.demo.kind",
    version: "1.0.0",
  });

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
