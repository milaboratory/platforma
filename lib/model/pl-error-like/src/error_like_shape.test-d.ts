import { describe, expectTypeOf, test } from "vitest";
import type { ErrorLike, PlErrorLike, StandardErrorLike } from "./error_like_shape";

type ExpectedPlErrorLike = {
  type: "PlError";
  name: string;
  message: string;
  fullMessage?: string | undefined;
  stack?: string | undefined;
} & {
  cause?: ExpectedErrorLike;
  errors?: ExpectedErrorLike[];
};

type ExpectedStandardErrorLike = {
  type: "StandardError";
  name: string;
  message: string;
  stack?: string | undefined;
} & {
  cause?: ExpectedErrorLike;
  errors?: ExpectedErrorLike[];
};

type ExpectedErrorLike = ExpectedStandardErrorLike | ExpectedPlErrorLike;

describe("error like types", () => {
  test("stay the same", () => {
    expectTypeOf<PlErrorLike>().toEqualTypeOf<ExpectedPlErrorLike>();
    expectTypeOf<StandardErrorLike>().toEqualTypeOf<ExpectedStandardErrorLike>();
    expectTypeOf<ErrorLike>().toEqualTypeOf<ExpectedErrorLike>();
  });
});
