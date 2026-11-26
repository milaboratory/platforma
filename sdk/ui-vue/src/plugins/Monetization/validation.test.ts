import * as v from "valibot";
import { describe, expect, expectTypeOf, test } from "vitest";
import { DryRunResult, Response } from "./validation";

type ExpectedLimit = {
  type: "unique_launches" | "volume_limit";
  used: number;
  toSpend: number;
  available: number | null;
};

type ExpectedDryRunResult = {
  productKey: string;
  productName: string;
  customerEmail?: string | undefined;
  canRun: boolean;
  status: string;
  mnz: {
    type?: "trial" | "free" | "single_payment" | "subscription" | "base" | undefined;
    endOfBillingPeriod?: string | null | undefined;
    limits?: ExpectedLimit[] | undefined;
  };
};

type ExpectedResponse =
  | {
      httpError?: string | undefined;
      response?:
        | {
            result?: ExpectedDryRunResult | undefined;
            error?: unknown;
          }
        | undefined;
    }
  | undefined;

describe("monetization schemas", () => {
  test("keep their output types", () => {
    expectTypeOf<DryRunResult>().toEqualTypeOf<ExpectedDryRunResult>();
    expectTypeOf<Response>().toEqualTypeOf<ExpectedResponse>();
  });

  test("parse a dry run response", () => {
    const result = {
      productKey: "key",
      canRun: true,
      status: "active",
      extra: 1,
      mnz: {
        type: "subscription",
        endOfBillingPeriod: null,
        limits: [{ type: "volume_limit", used: 1, toSpend: 2, available: null }],
      },
    };
    const withExtraKeys = {
      ...result,
      mnz: { ...result.mnz, extra: 1, limits: [{ ...result.mnz.limits[0], extra: 1 }] },
    };
    expect(v.parse(Response, { response: { result: withExtraKeys } })).toEqual({
      response: {
        result: {
          productKey: "key",
          productName: "Unknown product",
          canRun: true,
          status: "active",
          mnz: result.mnz,
        },
      },
    });
    expect(v.parse(Response, undefined)).toBeUndefined();
  });

  test("reject a malformed result", () => {
    expect(v.safeParse(Response, { response: { result: { productKey: "key" } } }).success).toBe(
      false,
    );
    expect(
      v.safeParse(DryRunResult, {
        productKey: "key",
        canRun: true,
        status: "active",
        mnz: { limits: [{ type: "other", used: 1, toSpend: 1, available: 1 }] },
      }).success,
    ).toBe(false);
  });
});
