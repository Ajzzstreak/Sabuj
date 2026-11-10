import { z } from 'zod';
import { RETAILER_IDS } from './retailers.js';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const MAX_EVENTS_PER_BATCH = 100;
const MAX_STRING = 200;

/** Client-generated id: 8-128 chars of [A-Za-z0-9._:-] (UUIDs, install ids). */
export const DeviceId = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/, 'deviceId must be 8-128 characters of A-Z a-z 0-9 . _ : -');

const shortString = z.string().trim().min(1).max(MAX_STRING);
const money = z.number().finite().min(0).max(1_000_000);

export const EventSchema = z.object({
  type: z.enum(['search', 'product_view', 'offer_click', 'offer_impression', 'save', 'unsave']),
  // Any plausible epoch-millis timestamp (2001 .. 2100).
  ts: z.number().int().min(978_307_200_000).max(4_102_444_800_000),
  query: shortString.optional(),
  productId: shortString.optional(),
  offerId: shortString.optional(),
  retailerId: z.enum(RETAILER_IDS).optional(),
  category: shortString.optional(),
  brand: shortString.optional(),
  price: money.optional(),
  rank: z.number().int().min(0).max(1000).optional(),
  wasCheapest: z.boolean().optional(),
  premiumPaid: money.optional(),
});

export const EventsRequestSchema = z.object({
  deviceId: DeviceId,
  events: z.array(EventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'q is required').max(120),
  deviceId: DeviceId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const SuggestQuerySchema = z.object({
  q: z.string().max(80).default(''),
  deviceId: DeviceId.optional(),
});

export const OptionalDeviceQuerySchema = z.object({ deviceId: DeviceId.optional() });
export const RequiredDeviceQuerySchema = z.object({ deviceId: DeviceId });
export const ProductParamsSchema = z.object({ id: z.string().min(1).max(160).regex(/^[A-Za-z0-9._:~-]+$/, 'invalid product id') });

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  throw new HttpError(400, 'invalid_request', `${where}${issue?.message ?? 'invalid request'}`);
}
