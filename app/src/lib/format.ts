import type { Offer } from '@/api/contract';

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
