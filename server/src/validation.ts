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

const shortString = z.string().trim().min(1).max(MAX_STRING);
const money = z.number().finite().min(0).max(1_000_000);

export const EventSchema = z.object({
  type: z.enum(['search', 'product_view', 'offer_click', 'offer_impression', 'save', 'unsave', 'list_add', 'list_remove']),
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
  events: z.array(EventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

/** 5-digit US ZIP; ZIP+4 is accepted and truncated. */
const Zip = z
  .string()
  .trim()
  .regex(/^\d{5}(-?\d{4})?$/, 'zip must be a 5-digit US ZIP code')
  .transform((z5) => z5.slice(0, 5));

const RetailerIdSchema = z.enum(RETAILER_IDS);

/**
 * `memberships=costco,samsclub`; an empty value means "holds none"; an absent
 * parameter means "not answered" (undefined).
 */
const MembershipsParam = z
  .string()
  .max(100)
  .transform((v) => [...new Set(v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))])
  .pipe(z.array(RetailerIdSchema, 'memberships must be a comma-separated list of retailer ids'));

const MembershipsBody = z
  .array(RetailerIdSchema)
  .max(RETAILER_IDS.length)
  .transform((v) => [...new Set(v)]);

const StoreId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/, 'invalid store id');
export const MAX_STORE_IDS = 12;

/** `storeIds=wm-94105-1,kr-94105-2`: the stores to price at. */
const StoreIdsParam = z
  .string()
  .max(600)
  .transform((v) => [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))])
  .pipe(z.array(StoreId, 'storeIds must be a comma-separated list of store ids').max(MAX_STORE_IDS));

/** Shopper context accepted by every catalog endpoint. */
const contextQuery = { zip: Zip.optional(), memberships: MembershipsParam.optional(), storeIds: StoreIdsParam.optional() };

export const StoresQuerySchema = z.object({ zip: Zip });

const ProductId = z.string().min(1).max(160).regex(/^[A-Za-z0-9._:~-]+$/, 'invalid product id');

/** POST /v1/basket. `maxItems` comes from config (BASKET_MAX_ITEMS). */
export const basketRequestSchema = (maxItems: number) =>
  z.object({
    items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            productId: ProductId.optional(),
            query: z.string().trim().min(1).max(100).optional(),
            quantity: z.number().int().min(1).max(99),
          })
          .refine((i) => i.productId !== undefined || i.query !== undefined, 'each item needs a productId or a query'),
      )
      .min(1)
      .max(maxItems)
      .refine((items) => new Set(items.map((i) => i.id)).size === items.length, 'item ids must be unique'),
    zip: Zip.optional(),
    memberships: MembershipsBody.optional(),
    storeIds: z.array(StoreId).max(MAX_STORE_IDS).optional(),
  });

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'q is required').max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  ...contextQuery,
});

export const SuggestQuerySchema = z.object({
  q: z.string().max(80).default(''),
});

export const ContextQuerySchema = z.object(contextQuery);

export const LookupQuerySchema = z.object({
  gtin: z.string().trim().min(1, 'gtin is required').max(40),
  ...contextQuery,
});

export const MAX_ASK_CHARS = 300;
export const AskRequestSchema = z.object({
  text: z.string().trim().min(1, 'text is required').max(MAX_ASK_CHARS),
  zip: Zip.optional(),
  memberships: MembershipsBody.optional(),
});

export const CreateAlertRequestSchema = z.object({
  productId: z.string().min(1).max(160).regex(/^[A-Za-z0-9._:~-]+$/, 'invalid product id'),
  targetPrice: z.number().finite().gt(0).max(1_000_000),
  zip: Zip.optional(),
  memberships: MembershipsBody.optional(),
});

export const AlertParamsSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'invalid alert id') });

/** Expo push token: ExponentPushToken[...] (or the newer ExpoPushToken[...]). */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,120}\]$/;
export const PushTokenRequestSchema = z.object({
  token: z.string().regex(EXPO_PUSH_TOKEN, 'token must be an Expo push token').nullable(),
});

export const ProductParamsSchema = z.object({ id: z.string().min(1).max(160).regex(/^[A-Za-z0-9._:~-]+$/, 'invalid product id') });

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  const missing = issue?.code === 'invalid_type' && /received undefined$/.test(issue.message);
  const message = missing ? 'is required' : (issue?.message ?? 'invalid request');
  throw new HttpError(400, 'invalid_request', `${where}${message}`);
}
