import { describe, test, expect } from "vitest";
import { ensureErrorLike, parseErrorLikeSafe } from "./error_like_shape";

test("should create error like from string", () => {
  const errorLike = ensureErrorLike("test error");

  expect(errorLike.message).to.equal('"test error"');
  expect(errorLike.type).to.equal("StandardError");
});

test("should read name and message of an Error instance", () => {
  const cause = new TypeError("inner");
  const error = Object.assign(new Error("outer", { cause }), { fullMessage: "full" });
  error.name = "PlTengoError";
  const errorLike = ensureErrorLike(error);

  expect(errorLike).toMatchObject({
    type: "PlError",
    name: "PlTengoError",
    message: "outer",
    fullMessage: "full",
    cause: { type: "StandardError", name: "TypeError", message: "inner" },
  });
});

describe("parseErrorLikeSafe", () => {
  test("parses nested errors and strips unknown keys", () => {
    const parsed = parseErrorLikeSafe(
      JSON.stringify({
        type: "PlError",
        name: "PlTengoError",
        message: "outer",
        extra: 1,
        cause: { type: "StandardError", name: "Error", message: "inner", extra: 2 },
        errors: [{ type: "StandardError", name: "Error", message: "listed" }],
      }),
    );
    expect(parsed).toEqual({
      success: true,
      data: {
        type: "PlError",
        name: "PlTengoError",
        message: "outer",
        cause: { type: "StandardError", name: "Error", message: "inner" },
        errors: [{ type: "StandardError", name: "Error", message: "listed" }],
      },
    });
  });

  test("fails on a wrong shape and on bad JSON", () => {
    const wrongShape = parseErrorLikeSafe(JSON.stringify({ type: "PlError", name: "x" }));
    expect(wrongShape.success).toBe(false);
    expect(!wrongShape.success && wrongShape.error).toBeInstanceOf(Error);
    expect(parseErrorLikeSafe("{").success).toBe(false);
  });
});
