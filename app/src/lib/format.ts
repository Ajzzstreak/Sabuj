import type { BasketLine, Offer, PackageSize } from '@/api/contract';

export function money(value: number): string {
  const fixed = Math.abs(value).toFixed(2);
  const [whole = '0', cents = '00'] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${value < 0 ? '-' : ''}$${grouped}.${cents}`;
}

/** Drops ".00" for round amounts: "$12", "$12.50". */
export function moneyShort(value: number): string {
  const s = money(value);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export function shippingNote(offer: Pick<Offer, 'shipping'>): string {
  if (offer.shipping === 0) return 'Free shipping';
  if (offer.shipping == null) return 'Shipping at checkout';
  return `+ ${money(offer.shipping)} shipping`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-03" -> "Nov 3". Parsed by hand so time zones cannot shift the day. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!m || !d) return iso;
  return `${MONTHS[m - 1] ?? ''} ${d}`;
}

/** "$54.99 item + $5.99 shipping + $4.54 est. tax = $65.52". Tax is always labelled an estimate. */
export function breakdownLine(offer: Pick<Offer, 'price' | 'shipping' | 'estimatedTax' | 'landedPrice'>): string {
  const parts = [`${money(offer.price)} item`];
  parts.push(offer.shipping == null ? 'shipping at checkout' : offer.shipping === 0 ? 'free shipping' : `${money(offer.shipping)} shipping`);
  parts.push(offer.estimatedTax == null ? 'tax not estimated' : `${money(offer.estimatedTax)} est. tax`);
  return `${parts.join(' + ')} = ${money(offer.landedPrice)}`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'recently';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

const UNIT_WORD: Record<PackageSize['unit'], string> = { oz: 'oz', lb: 'lb', fl_oz: 'fl oz', gal: 'gal', ct: 'ct', each: 'each' };

/** { amount: 5, unit: 'lb' } -> "5 lb". */
export function sizeText(size: PackageSize | null | undefined): string | null {
  if (!size) return null;
  const amount = Number.isInteger(size.amount) ? String(size.amount) : String(Math.round(size.amount * 100) / 100);
  return size.unit === 'each' ? (size.amount === 1 ? 'each' : `${amount} each`) : `${amount} ${UNIT_WORD[size.unit]}`;
}

/** "per oz" -> "oz"; "each" stays "each". */
export const unitWord = (unitLabel: string) => unitLabel.replace(/^per\s+/i, '');

/** Unit price for display: under a dollar in cents ("4.9¢/oz"), otherwise dollars ("$1.25/lb"). */
export function unitPriceText(offer: Pick<Offer, 'unitPrice' | 'unitLabel'>): string | null {
  if (offer.unitPrice == null || !offer.unitLabel) return null;
  const word = unitWord(offer.unitLabel);
  const amount = offer.unitPrice < 1 ? `${(offer.unitPrice * 100).toFixed(1)}¢` : money(offer.unitPrice);
  return word === 'each' ? `${amount} each` : `${amount}/${word}`;
}

/** Packs a basket line buys: "2 × 12 oz", or "2 packs" when the pack size is unknown. */
export function packsText(line: Pick<BasketLine, 'packages' | 'packSize'>): string {
  const size = sizeText(line.packSize);
  return size ? `${line.packages} × ${size}` : `${line.packages} ${line.packages === 1 ? 'pack' : 'packs'}`;
}

/** True when the line buys noticeably more than was listed (a bigger pack, or a pack that does not divide evenly). */
export const overbuys = (line: Pick<BasketLine, 'overbuyRatio'>) => line.overbuyRatio != null && line.overbuyRatio > 1;

/** "buys 25 lb for your 5 lb", or null when the line buys what was listed (or sizes are unknown). */
export function overbuyText(line: Pick<BasketLine, 'overbuyRatio' | 'coveredAmount' | 'requestedAmount'>): string | null {
  if (!overbuys(line)) return null;
  const covered = sizeText(line.coveredAmount);
  const requested = sizeText(line.requestedAmount);
  return covered && requested ? `buys ${covered} for your ${requested}` : null;
}
