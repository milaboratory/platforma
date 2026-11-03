import * as v from "valibot";

const MonetizationType = v.picklist([
  "trial",
  "free",
  "single_payment",
  "subscription",
  "base", // outdated
]);

export const Limit = v.object({
  type: v.picklist(["unique_launches", "volume_limit"]),
  used: v.number(),
  toSpend: v.number(),
  available: v.nullable(v.number()), // null if unlimited
});

const DryRunResult = v.object(
  {
    productKey: v.string(),
    productName: v.optional(v.string(), "Unknown product"),
    customerEmail: v.optional(v.string()),
    canRun: v.boolean(),
    status: v.string(), // 'select-tariff', 'active', 'payment_required', 'limits_exceeded', 'inactive', 'unknown',
    mnz: v.object({
      type: v.optional(MonetizationType),
      endOfBillingPeriod: v.nullish(v.string()),
      limits: v.optional(v.array(Limit)),
    }),
  },
  "Invalid DryRunResult",
);

type DryRunResult = v.InferOutput<typeof DryRunResult>;

const Response = v.optional(
  v.object({
    httpError: v.optional(v.string()),
    response: v.optional(
      v.object({
        result: v.optional(DryRunResult),
        error: v.optional(v.unknown()),
      }),
    ),
  }),
);

type Response = v.InferOutput<typeof Response>;

export { MonetizationType, DryRunResult, Response };
