/**
 * GTIN normalization. Barcodes arrive as UPC-A (12 digits), EAN-13, GTIN-14 or
 * EAN-8, sometimes with separators and sometimes with leading zeros dropped by
 * the scanner or a spreadsheet. Everything is compared in one canonical form:
 * the zero-padded 14-digit GTIN.
 */

function checkDigitValid(gtin14: string): boolean {
  let sum = 0;
  // From the right: the check digit has weight 1, then 3, 1, 3, ...
  for (let i = 0; i < 14; i++) {
    const d = gtin14.charCodeAt(13 - i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return sum % 10 === 0;
}

/**
 * Canonical 14-digit GTIN, or null when the input cannot be a barcode:
 * non-digits are stripped, 8-14 digits are accepted (shorter than 12 only
 * happens when leading zeros were dropped), the mod-10 check digit must hold.
 */
export function normalizeGtin(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  const padded = digits.padStart(14, '0');
  if (/^0+$/.test(padded) || !checkDigitValid(padded)) return null;
  return padded;
}
