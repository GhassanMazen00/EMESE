/* EMESE: optional instant estimates on the order form.
 *
 * Fill in your prices (Egyptian pounds) and visitors see a price range while they fill the form.
 * Anything left as null means "no estimate" for that product or method: the form then just says
 * the team will send the price. Nothing here is shown until you fill it in.
 */
export const CURRENCY = 'EGP';

// Price of one blank product.
export const PRODUCT = {
  tee: null, polo: null, polo_ls: null, hoodie: null, apron: null, cap: null,
  zipper: null, label: null, patch: null, hangtag: null, tote: null, keychain: null,
  notebook: null, pen: null, cards: null, mug: null, tumbler: null, mousepad: null, flag: null
};

// Cost of decorating one piece with one logo in a standard size.
export const METHOD = {
  dtf: null, screen: null, digital: null, sub: null, uv: null, uvdtf: null,
  stitch: null, woven: null, laser: null, foil: null
};

// One-time cost per order (screens, embroidery digitizing...).
export const SETUP = { screen: null, stitch: null, woven: null, foil: null };

// Quantity discounts: [from this many pieces, multiply the unit price by].
export const TIERS = [[1, 1], [50, 0.92], [100, 0.85], [300, 0.78], [1000, 0.7]];

// The range shown around the calculated price.
export const SPREAD = 0.1;

/* {min, max, currency} or null when a price is missing. */
export function estimate(productId, method, qty) {
  const p = PRODUCT[productId], m = METHOD[method];
  qty = Math.floor(Number(qty));
  if (p == null || m == null || !(qty > 0)) return null;
  const factor = TIERS.filter(([from]) => qty >= from).pop()[1];
  const total = (p + m) * factor * qty + (SETUP[method] || 0);
  return { min: Math.round(total * (1 - SPREAD)), max: Math.round(total * (1 + SPREAD)), currency: CURRENCY };
}
