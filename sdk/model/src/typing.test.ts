import { BlockSection } from "@milaboratories/pl-model-common";
import { test } from "vitest";
import { DeriveHref, StdCtx } from "./bconfig";
import {
  Args,
  ConfigResult,
  getJsonField,
  getResourceField,
  getResourceValueAsJson,
  It,
  makeObject,
  mapRecordValues,
} from "./config";

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

function _typeTest1() {
  const a = getJsonField(Args, "field1");
  const dd = getResourceValueAsJson<{ s: boolean; g: number }>()(
    getResourceField(MainOutputs, "a"),
  );

  const cfg1 = makeObject({
    a,
    b: "attagaca",
    c: mapRecordValues(getJsonField(Args, "field2"), getJsonField(It, "b")),
    d: getJsonField(dd, "s"),
  });

  type Ret = ConfigResult<
    typeof cfg1,
    StdCtx<{
      field1: number;
      field2: Record<string, { b: "yap" }>;
    }>
  >;

  assertType<
    Ret,
    {
      a: number;
      b: "attagaca";
      c: Record<string, "yap">;
      d: boolean;
    }
  >();
}

function testCreateSections<const S extends BlockSection[]>(_sections: () => S): DeriveHref<S> {
  return undefined as any;
}

test("test config content", () => {
  const s1 = testCreateSections(() => [
    { type: "delimiter" },
    { type: "link", href: "/a1", label: "l" },
    { type: "link", href: "/a2", label: "ls" },
  ]);

  assertType<typeof s1, "/a1" | "/a2">();

  const s2 = testCreateSections(() => [{ type: "delimiter" }]);

  assertType<typeof s2, never>();
});
