/**
 * Price-drop alerts: pricing an alert against the current catalog, and the
 * background checker that triggers alerts and sends pushes.
 * No LLM is involved anywhere here.
 */
import type { Catalog } from './catalog.js';
import type { PriceAlert, RetailerId } from './contract.js';
import type { AlertRow, Store } from './db.js';
import type { ProviderProduct } from './providers/types.js';
import type { PushMessage, PushSender } from './push.js';
import { retailerName } from './retailers.js';
import { applyContext, cheapestRankable, shopperContext } from './shopper.js';

export interface BestPrice {
  price: number;
  retailerId: RetailerId;
}

/** Lowest landedPrice among in-stock, eligible, priced offers under the alert's own zip/memberships. */
export function bestPriceFor(product: ProviderProduct, alert: Pick<AlertRow, 'zip' | 'memberships'>): BestPrice | null {
  const best = cheapestRankable(applyContext(product.offers, shopperContext(alert.zip, alert.memberships)));
  return best ? { price: best.landedPrice, retailerId: best.retailerId } : null;
}

export function toPriceAlert(row: AlertRow, best: BestPrice | null): PriceAlert {
  return {
    id: row.id,
    productId: row.productId,
    productTitle: row.productTitle,
    targetPrice: row.targetPrice,
    priceAtCreation: row.priceAtCreation,
    currentBestPrice: best?.price ?? null,
    currentBestRetailerId: best?.retailerId ?? null,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    triggeredAt: row.triggeredAt === null ? null : new Date(row.triggeredAt).toISOString(),
  };
}

export interface AlertCheckDeps {
  store: Store;
  catalog: Catalog;
  push: PushSender;
  now?: () => number;
  log?: (msg: string, detail?: Record<string, unknown>) => void;
  /** Alerts read per page. */
  pageSize?: number;
}

export interface AlertCheckResult {
  checked: number;
  triggered: number;
  pushed: number;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Evaluate every active alert against current prices. An alert whose best
 * rankable landedPrice is at or below its target becomes 'triggered' (once),
 * and its device gets a push if it registered a push token.
 * Safe to call directly (tests, ops); never throws.
 */
export async function checkAlerts(deps: AlertCheckDeps): Promise<AlertCheckResult> {
  const now = deps.now ?? Date.now;
  const pageSize = deps.pageSize ?? 500;
  const result: AlertCheckResult = { checked: 0, triggered: 0, pushed: 0 };
  const messages: PushMessage[] = [];
  let after = '';
  try {
    for (;;) {
      const page = deps.store.activeAlerts(after, pageSize);
      if (page.length === 0) break;
      after = page[page.length - 1]!.id;
      // One catalog read per distinct product, however many alerts watch it.
      const products = new Map<string, ProviderProduct | null>();
      await Promise.all(
        [...new Set(page.map((a) => a.productId))].map(async (id) => {
          try {
            products.set(id, (await deps.catalog.product(id)).value);
          } catch {
            products.set(id, null); // upstream down: leave these alerts for the next run
          }
        }),
      );
      for (const alert of page) {
        result.checked += 1;
        const product = products.get(alert.productId);
        const best = product ? bestPriceFor(product, alert) : null;
        if (!best || best.price > alert.targetPrice) continue;
        if (!deps.store.markAlertTriggered(alert.id, now())) continue;
        result.triggered += 1;
        const token = deps.store.getPushToken(alert.deviceId);
        if (!token) continue; // no push token registered: the app sees it on GET /v1/alerts
        messages.push({
          to: token,
          title: 'Price drop',
          body: `${alert.productTitle} is now ${money(best.price)} at ${retailerName(best.retailerId)} (your target: ${money(alert.targetPrice)}).`,
          data: { type: 'price_alert', alertId: alert.id, productId: alert.productId },
        });
      }
      if (page.length < pageSize) break;
    }
    if (messages.length > 0) {
      const { invalidTokens } = await deps.push.send(messages);
      result.pushed = messages.length;
      for (const t of invalidTokens) deps.store.clearPushTokenValue(t);
    }
  } catch (err) {
    deps.log?.('alert check failed', { error: err instanceof Error ? err.message : String(err) });
  }
  return result;
}
