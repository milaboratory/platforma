import type { BlobHandleAndSize } from "@platforma-sdk/model";
import * as v from "valibot";
import { describe, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import { ReactiveFileContent } from "./fileContent";

vi.mock("@platforma-sdk/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platforma-sdk/model")>()),
  getRawPlatformaInstance: () => ({
    blobDriver: {
      getContent: async () => new TextEncoder().encode(JSON.stringify({ name: "a", count: 1 })),
    },
  }),
}));

const Schema = v.object({ name: v.string(), count: v.number() });
const handle = "handle" as BlobHandleAndSize["handle"];

describe("getContentJson", () => {
  test("validates the content with each schema", async () => {
    const scope = effectScope();
    const refs = scope.run(() => {
      const content = ReactiveFileContent.use();
      return {
        valid: content.getContentJson(handle, Schema),
        invalid: content.getContentJson(handle, v.object({ name: v.number() })),
        transformed: content.getContentJson(
          handle,
          v.pipe(
            Schema,
            v.transform(({ count }) => count + 1),
          ),
        ),
        async: content.getContentJson(
          handle,
          v.pipeAsync(
            Schema,
            v.checkAsync(async () => true),
          ),
        ),
        legacy: content.getContentJson(handle, {
          safeParse: (value: unknown) =>
            typeof value === "object" && value !== null && "name" in value
              ? { success: true as const, data: value.name }
              : { success: false as const },
        }),
      };
    })!;
    await vi.waitFor(() => expect(refs.valid.value).toEqual({ name: "a", count: 1 }));
    expect(refs.invalid.value).toBeUndefined();
    expect(refs.transformed.value).toBe(2);
    expect(() => refs.async.value).toThrow(/synchronous schema/);
    expect(refs.legacy.value).toBe("a");
    scope.stop();
  });
});
