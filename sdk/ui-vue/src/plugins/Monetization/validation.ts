import { z } from 'zod';

const MonetizationTrial = z.literal('trial');
const MonetizationFree = z.literal('free');
const MonetizationSinglePayment = z.literal('single_payment');
const MonetizationSubscription = z.literal('subscription');

const MonetizationType = z.union([
  MonetizationTrial,
  MonetizationFree,
  MonetizationSinglePayment,
  MonetizationSubscription,
  z.literal('base'), // outdated
]);

const DryRunResult = z.object({
  productKey: z.string(),
  productName: z.string().default('Unknown product'),
  canRun: z.boolean(),
  status: z.union([
    z.literal('select-tariff'),
    z.literal('active'),
    z.literal('payment_required'),
    z.literal('limits_exceeded'),
  ]),
  mnz: z.object({
    type: MonetizationType.optional(),
    details: z.object({
      spentRuns: z.number(),
      runsToSpend: z.number(),
      willRemainAfterRun: z.number().nullable(),
      subscription: z.unknown(),
    }),
  }),
}, { message: 'Invalid CreateProductStatResult' });

type DryRunResult = z.infer<typeof DryRunResult>;

const Response = z.object({
  httpError: z.string().optional(),
  response: z.object({
    result: DryRunResult.optional(),
    error: z.unknown().optional(),
  }).optional(),
}).optional();

type Response = z.infer<typeof Response>;

export {
  MonetizationType,
  DryRunResult,
  Response,
};
