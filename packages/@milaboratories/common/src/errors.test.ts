import { describe, test, expect } from "vitest";
import {
  deserializeResult,
  unwrapResult,
  AbortError,
  hasAbortError,
  wrapAndSerializeAsync,
} from "./errors";

describe("Full error handling cycle example", () => {
  test("should handle complete workflow: async callback -> serialize -> deserialize with nested AbortError", async () => {
    const abortError = new AbortError("Operation was aborted");
    const middleError = new Error("Middle layer failed", { cause: abortError });
    const topError = new Error("Top level operation failed", { cause: middleError });

    const serialized = await wrapAndSerializeAsync(async () => {
      throw topError;
    });

    expect(serialized.error).toBeDefined();
    expect(serialized.error?.message).toBe("Top level operation failed");
    expect(serialized.error?.cause?.message).toBe("Middle layer failed");
    expect(serialized.error?.cause?.cause?.message).toBe("Operation was aborted");
    expect(serialized.error?.cause?.cause?.name).toBe("AbortError");

    const deserialized = deserializeResult(serialized);
    expect(deserialized.error).toBeInstanceOf(Error);
    expect(deserialized.error?.message).toBe("Top level operation failed");

    if (!deserialized.error) {
      throw new Error("Deserialized error is undefined");
    }

    const deserializedError = deserialized.error;
    const middleCause = deserializedError.cause as Error;
    const abortCause = middleCause.cause as Error;

    expect(middleCause).toBeInstanceOf(Error);
    expect(middleCause.message).toBe("Middle layer failed");

    expect(abortCause).toBeInstanceOf(Error);
    expect(abortCause.message).toBe("Operation was aborted");
    expect(abortCause.name).toBe("AbortError");

    expect(() => unwrapResult(deserialized)).toThrow("Top level operation failed");
    expect(hasAbortError(deserialized.error)).toBe(true);
  });
});
