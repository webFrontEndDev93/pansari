/**
 * Pricing, units and stock rules.
 *
 * Money convention: `salePrice` is a TAX-INCLUSIVE rupee amount, which is how a
 * Pakistani shop prices and bills. Tax is therefore back-calculated out of the
 * line total rather than added on top of it.
 *
 * Units: a line quantity is either a count of things (piece, packet, dozen) or a
 * weight or volume (kg, litre). For a weighed unit, `salePrice` is the price per
 * kilogram or per litre, and the quantity is fractional — 0.75 kg of daal is an
 * ordinary sale, not an edge case. Everything below that touches quantity has to
 * hold up under that, which is why quantities are rounded to three places at
 * every step and stock is compared with a half-gram tolerance.
 */

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Quantities to the gram. 0.1 + 0.2 is 0.30000000000000004; stock cannot be. */
export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

/**
 * How each unit is sold.
 *
 * `step` is what the +/- buttons move by, and `quick` builds the one-tap keys.
 * `weighed` is the one that matters everywhere else: it decides whether a
 * quantity may be fractional, how it is printed, and whether the till offers a
 * weight pad or a piece counter.
 */
export const UNITS = {
  piece:  { label: 'Piece',  short: 'pc',  weighed: false, step: 1,    quick: [1, 2, 5, 10] },
  packet: { label: 'Packet', short: 'pkt', weighed: false, step: 1,    quick: [1, 2, 5, 10] },
  dozen:  { label: 'Dozen',  short: 'dz',  weighed: false, step: 1,    quick: [1, 2, 3, 6] },
  kg:     { label: 'Kilogram', short: 'kg', weighed: true, step: 0.25, quick: [0.25, 0.5, 1, 5] },
  litre:  { label: 'Litre',  short: 'L',   weighed: true, step: 0.25,  quick: [0.25, 0.5, 1, 5] },
};

export const UNIT_KEYS = Object.keys(UNITS);

export const unitOf = (unit) => UNITS[unit] ?? UNITS.piece;
export const isWeighed = (unit) => unitOf(unit).weighed;

/** Rounds a quantity the way its unit allows: grams for weight, whole things otherwise. */
export function roundQty(qty, unit) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return 0;
  return isWeighed(unit) ? round3(n) : Math.round(n);
}

/**
 * Half a gram. Weighing 0.5 kg out of a batch holding exactly 0.5 kg must not be
 * refused because the two differ in the fifteenth decimal place.
 */
export const QTY_EPSILON = 0.0005;

/** True when `qty` exceeds `available` by more than rounding noise. */
export const exceedsStock = (qty, available) => Number(qty) - Number(available) > QTY_EPSILON;

/**
 * How a quantity reads on screen and on the bill.
 *
 * Under a kilo a shopkeeper says grams, not 0.25 kg, so that is what gets
 * printed — the customer is checking the slip against what they asked for.
 */
export function formatQty(qty, unit) {
  const n = Number(qty) || 0;
  const u = unitOf(unit);
  if (!u.weighed) return `${Math.round(n)} ${u.short}`;
  if (n > 0 && n < 1) {
    const small = Math.round(n * 1000);
    return unit === 'litre' ? `${small} ml` : `${small} g`;
  }
  return `${round3(n)} ${u.short}`;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Not every grocery item has an expiry — loose rice and daal simply do not. */
export const hasExpiry = (iso) => typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso);

/** Days from today until `isoDate`. Negative once the date has passed. */
export function daysUntil(isoDate) {
  if (!hasExpiry(isoDate)) return Infinity;
  const d = new Date(`${isoDate}T00:00:00`);
  const now = new Date(`${todayISO()}T00:00:00`);
  return Math.round((d - now) / 86_400_000);
}

/** An undated batch is never expired, rather than being NaN-compared into one. */
export const isExpired = (isoDate) => hasExpiry(isoDate) && daysUntil(isoDate) < 0;

/**
 * Totals for one cart line.
 * `discountPct` applies to the gross line amount before tax is split out.
 */
export function lineTotals({ salePrice, qty, unit = 'piece', taxRate = 0, discountPct = 0 }) {
  const gross = round2(Number(salePrice) * roundQty(qty, unit));
  const discount = round2((gross * Number(discountPct)) / 100);
  const net = round2(gross - discount);
  const taxable = round2(net / (1 + Number(taxRate) / 100));
  const tax = round2(net - taxable);
  return { gross, discount, net, taxable, tax };
}

/**
 * Bill totals. `extraDiscount` is a flat rupee amount taken off the whole bill
 * and is spread across lines proportionally so the tax split stays honest.
 */
export function billTotals(lines, { extraDiscount = 0, roundOff = true } = {}) {
  const computed = lines.map((l) => lineTotals(l));
  const gross = round2(computed.reduce((s, c) => s + c.gross, 0));
  const lineDiscount = round2(computed.reduce((s, c) => s + c.discount, 0));
  const net = round2(computed.reduce((s, c) => s + c.net, 0));

  const capped = round2(Math.min(Math.max(Number(extraDiscount) || 0, 0), net));
  const factor = net > 0 ? (net - capped) / net : 0;

  const taxable = round2(computed.reduce((s, c) => s + c.taxable * factor, 0));
  const tax = round2(computed.reduce((s, c) => s + c.tax * factor, 0));
  const payable = round2(taxable + tax);

  const rounded = roundOff ? Math.round(payable) : payable;
  const roundOffAmount = round2(rounded - payable);

  return {
    gross,
    discount: round2(lineDiscount + capped),
    lineDiscount,
    extraDiscount: capped,
    taxableValue: taxable,
    tax,
    subtotal: net,
    roundOff: roundOffAmount,
    total: round2(rounded),
  };
}

/** Quantity on hand for a product across all of its sellable batches. */
export function sellableStock(batches, productId) {
  return round3(
    batches
      .filter((b) => b.productId === productId && b.quantity > 0 && !isExpired(b.expiry))
      .reduce((s, b) => s + b.quantity, 0),
  );
}

/**
 * Batches that can actually be sold, nearest expiry first.
 *
 * Undated batches sort last rather than first: a dated one is the one with a
 * deadline, so it should leave the shelf before the sack of rice that has none.
 */
export function sellableBatches(batches, productId) {
  return batches
    .filter((b) => b.productId === productId && b.quantity > 0 && !isExpired(b.expiry))
    .sort((a, b) => {
      const da = hasExpiry(a.expiry);
      const db = hasExpiry(b.expiry);
      if (da !== db) return da ? -1 : 1;
      if (!da) return (a.receivedAt || '').localeCompare(b.receivedAt || '');
      return a.expiry.localeCompare(b.expiry);
    });
}

export function nextInvoiceNo(settings) {
  const seq = String(settings.nextInvoiceSeq ?? 1).padStart(5, '0');
  const yy = new Date().getFullYear().toString().slice(-2);
  return `${settings.invoicePrefix || 'INV'}-${yy}-${seq}`;
}
