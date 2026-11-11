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
          `[DRAFT] ${APP_NAME} has no accounts. The app is issued an anonymous device ID and token. With it we store your searches and plain-English questions, the products you open, the offers you tap, saves, price alerts and, if you set them, your ZIP code and warehouse-club memberships.`,
          '[DRAFT] If you allow notifications we store a push token so a price alert can reach your device.',
        ],
      },
      {
        heading: 'How we use it',
        body: [
          '[DRAFT] To order offers the way you tend to choose, to estimate tax and membership eligibility, and to check prices for your alerts.',
          '[DRAFT] Activity may be summarized by an AI model (Anthropic’s Claude) acting as our processor. State what is sent to it, the retention on their side and the legal basis.',
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
          '[DRAFT] Prices, shipping costs and stock are gathered from retailers and can be out of date or wrong. Sales tax is an estimate from your ZIP code. The retailer’s checkout is the final word.',
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
          '[DRAFT] Offers are ranked by total price — item, shipping and estimated tax — and by your own preferences. No retailer can pay for a higher position, a “Best price” badge or a “For you” pick.',
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
          '[DRAFT] ZIP code and memberships, when set, with every search, product and alert request.',
          '[DRAFT] Products opened; offers tapped, with the store, price, position and whether it was the cheapest; saves and removals.',
          '[DRAFT] Price alerts: product and target price. A push token, only if notifications are allowed.',
          '[DRAFT] Barcode numbers you scan or type. Never the camera image.',
        ],
      },
      {
        heading: 'Processed by an AI model',
        body: ['[DRAFT] Activity may be summarized, and plain-English questions interpreted, by an AI model (Anthropic’s Claude) on the server. List exactly which fields are included in those requests.'],
      },
      {
        heading: 'Kept only on this device',
        body: ['[DRAFT] Your saved list, recent searches, ZIP code and membership answers, and unsent activity. “Delete my data” clears all of them.'],
      },
      { heading: 'Never collected', body: ['[DRAFT] Name, email, contacts, precise location, advertising identifiers. Confirm this list against the shipped build and any SDKs added later.'] },
    ],
  },
};
