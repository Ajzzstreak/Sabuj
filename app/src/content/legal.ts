import type { Ionicons } from '@expo/vector-icons';
import { APP_NAME } from '@/config';

/**
 * TEMPLATES. Every paragraph below is placeholder copy written by an engineer,
 * not a lawyer. The owner must replace all of it (and have it reviewed) before
 * release. The screens that render these show a DRAFT banner until
 * LEGAL_COPY_IS_FINAL is set to true.
 */
export const LEGAL_COPY_IS_FINAL = false;

export type LegalDocId = 'privacy' | 'terms' | 'ranking' | 'data';

export interface LegalDoc {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** One line under the title. */
  summary: string;
  sections: { heading: string; body: string[] }[];
}

export const LEGAL_ORDER: LegalDocId[] = ['privacy', 'terms', 'ranking', 'data'];

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  privacy: {
    title: 'Privacy policy',
    icon: 'shield-checkmark-outline',
    summary: 'What we hold about you and what you can do about it.',
    sections: [
      {
        heading: 'Who we are',
        body: ['[DRAFT] Name the legal entity that operates the service, its address and a contact for privacy questions.'],
      },
      {
        heading: 'What we collect',
        body: [
          `[DRAFT] ${APP_NAME} has no accounts. The app is issued an anonymous device ID and token. With it we store your searches and plain-English questions, the products you open, the offers you tap, saves, shopping-list additions and removals, price alerts and, if you set them, your ZIP code, chosen stores and warehouse-club memberships.`,
          '[DRAFT] If you allow notifications we store a push token so a price alert can reach your device.',
        ],
      },
      {
        heading: 'How we use it',
        body: [
          '[DRAFT] To order offers the way you tend to choose, to estimate tax and membership eligibility, and to check prices for your alerts.',
          '[DRAFT] Only if you turn on “AI features” (it is off until you choose Allow), we send the text you type into Ask and a summary of your activity to Anthropic’s Claude, an AI model, acting as our processor, to interpret questions and describe how you shop. Never your ZIP code, device ID, name or email. You can turn it off at any time in Your profile; sending stops immediately and the AI-written profile is deleted. State the retention on Anthropic’s side and the legal basis (consent).',
        ],
      },
      {
        heading: 'Sharing, retention and your rights',
        body: [
          '[DRAFT] List processors and sub-processors, how long each kind of data is kept, and the rights that apply in your markets (access, deletion, objection, complaint).',
          '[DRAFT] “Delete my data” on the profile tab erases the server-side profile, activity and alerts for this device immediately. Say whether backups persist and for how long.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms',
    icon: 'document-text-outline',
    summary: 'The rules for using the service.',
    sections: [
      { heading: 'The service', body: [`[DRAFT] ${APP_NAME} compares prices from retailers. We do not sell anything; purchases happen on the retailer’s site under the retailer’s terms.`] },
      {
        heading: 'Prices are not guarantees',
        body: [
          '[DRAFT] Prices, shipping costs and stock are gathered from retailers and can be out of date or wrong. A “similar item” is our best match for a store’s own product, not a guarantee that it is equivalent. Shopping-list totals are estimates; a warehouse club’s line is one bulk pack, which is more product than listed. Sales tax is an estimate from your ZIP code. The retailer’s checkout is the final word.',
          '[DRAFT] Prices labelled “Demo” are sample data and are not offers.',
        ],
      },
      { heading: 'Acceptable use, liability, changes, governing law', body: ['[DRAFT] To be written by counsel.'] },
    ],
  },
  ranking: {
    title: 'How we rank',
    icon: 'podium-outline',
    summary: 'Why offers appear in the order they do.',
    sections: [
      {
        heading: 'By total price and your own preferences. Not by payment.',
        body: [
          '[DRAFT] Offers are ranked by total price — item, shipping and estimated tax, per unit (per oz, per count) when stores sell different sizes or their own version of an item — and by your own preferences. No retailer can pay for a higher position, a “Best price” badge or a “For you” pick.',
          '[DRAFT] “Best price” is always the lowest total among offers that are in stock, that you are eligible to buy, and that have a known price.',
        ],
      },
      {
        heading: 'What “your preferences” means',
        body: [
          '[DRAFT] If your activity shows you usually accept paying slightly more for a particular store, faster delivery or better reviews, that offer may be listed first as “For you”, with the reason shown. It is never recommended beyond the largest premium you have actually chosen to pay, and the cheapest offer stays marked.',
          '[DRAFT] Pausing “Learn from my activity” stops new activity from influencing the order.',
        ],
      },
      {
        heading: 'Affiliate links',
        body: [
          '[DRAFT — confirm before release] State plainly whether links to retailers earn a commission. If they do: say so here and next to the links (set AFFILIATE_LINKS_ENABLED in src/config.ts), and confirm that commissions do not affect ranking. If they do not: say that instead.',
        ],
      },
    ],
  },
  data: {
    title: 'Data we collect',
    icon: 'server-outline',
    summary: 'The complete list, in plain words.',
    sections: [
      {
        heading: 'Sent to our server',
        body: [
          '[DRAFT] Searches and plain-English questions (the text).',
          '[DRAFT] ZIP code, chosen stores and memberships, when set, with every search, product, list-total and alert request.',
          '[DRAFT] The items and quantities on your shopping list, each time it is totalled. State whether the server keeps them (today it does not).',
          '[DRAFT] Products opened; offers tapped, with the store, price, position and whether it was the cheapest; saves and removals.',
          '[DRAFT] Price alerts: product and target price. A push token, only if notifications are allowed.',
          '[DRAFT] Barcode numbers you scan or type. Never the camera image.',
        ],
      },
      {
        heading: 'Sent to an AI model, only if you allow it',
        body: [
          '[DRAFT] Off by default. Only after you choose Allow (asked the first time you use Ask, or under Your profile › AI features) does our server send data to Anthropic’s Claude. Turning it off stops this from the next request and deletes the AI-written profile.',
          '[DRAFT] For Ask: the text you typed, and the names, features, prices and ratings of a few catalog products that match it.',
          '[DRAFT] For your profile: counts of your activity by type; per store, how often you tapped it, whether it was the cheapest and the extra you paid; your top searches, categories and brands; and up to 30 recent actions (type, how long ago, search or list text, store, category, brand, price, position). Also the rules-based profile, including any warehouse memberships it inferred.',
          '[DRAFT] Never sent to the AI model: your ZIP code or any location, chosen stores, device ID or token, push token, product IDs, dates and times, name or email (which we do not collect).',
        ],
      },
      {
        heading: 'Kept only on this device',
        body: ['[DRAFT] Your shopping list, saved products, recent searches, ZIP code, store and membership answers, and unsent activity. “Delete my data” clears all of them.'],
      },
      { heading: 'Never collected', body: ['[DRAFT] Name, email, contacts, precise location, advertising identifiers. Confirm this list against the shipped build and any SDKs added later.'] },
    ],
  },
};
