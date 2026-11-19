import { BlockSection } from "@milaboratories/pl-model-common";
import { test } from "vitest";
import { DeriveHref } from "./bconfig";

type AssertEqual<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : false
  : false;

export const assertType = <T, Expected>(
  ..._: AssertEqual<T, Expected> extends true ? [] : ["invalid type"]
) => {
  // noop
};

type AssertExtends<T, Expected> = T extends Expected ? true : false;

export const assertTypeExtends = <T, Expected>(
  ..._: AssertExtends<T, Expected> extends true ? [] : ["invalid type"]
) => {
  // noop
};

function testCreateSections<const S extends BlockSection[]>(_sections: () => S): DeriveHref<S> {
  return undefined as any;
}

test("href derivation from sections", () => {
  const s1 = testCreateSections(() => [
    { type: "delimiter" },
    { type: "link", href: "/a1", label: "l" },
    { type: "link", href: "/a2", label: "ls" },
  ]);

  assertType<typeof s1, "/a1" | "/a2">();

  const s2 = testCreateSections(() => [{ type: "delimiter" }]);

  assertType<typeof s2, never>();
});
