import type { BlobHandleAndSize } from "@platforma-sdk/model";
import * as v from "valibot";
import { expectTypeOf, test } from "vitest";
import type { ComputedRef } from "vue";
import type { ReactiveFileContent } from "./fileContent";

test("getContentJson infers the output type of a Standard Schema", () => {
  const Schema = v.object({ name: v.string(), count: v.number() });
  const readContent = (content: ReactiveFileContent, handle: BlobHandleAndSize["handle"]) =>
    content.getContentJson(handle, Schema);
  expectTypeOf<ReturnType<typeof readContent>>().toEqualTypeOf<
    ComputedRef<{ name: string; count: number } | undefined>
  >();
});
