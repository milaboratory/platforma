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

export const Limit = z.object({
  type: z.union([
    z.literal('unique_launches'),
    z.literal('volume_limit'),
  ]),
  used: z.number(),
  toSpend: z.number(),
  available: z.number().nullable(), // null if unlimited
});

const DryRunResult = z.object({
  productKey: z.string(),
  productName: z.string().default('Unknown product'),
  customerEmail: z.string().optional(),
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
      subscription: z.unknown(),
    }),
    endOfBillingPeriod: z.string().nullable().optional(),
    limits: z.array(Limit).optional(),
  }),
}, { message: 'Invalid DryRunResult' });

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
