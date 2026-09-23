/**
 * Bulk import of a stock list.
 *
 * A shop opening on Pansari has its shelf in a spreadsheet, and typing four
 * hundred rows into a form is the sort of chore that makes people give up on a
 * till. The browser reads the file and shows a preview; this module is what
 * actually decides what happens to the shop's records.
 *
 * Three rules shape the whole thing.
 *
 * It revalidates everything. The browser has already checked these rows and
 * shown them to a person, but the browser is not the authority — the same
 * payload validators that guard the ordinary Add Item and Receive Stock routes
 * run again here, so an import cannot put anything into the database that
 * typing could not.
 *
 * It is all or nothing. A half-applied import leaves a shopkeeper unable to
 * tell which rows landed, and re-running it would double the ones that did.
 * Every row is checked before any row is written.
 *
 * It never blanks a field the sheet did not mention. A price list with only a
 * name and a barcode must not wipe the categories and tax rates the shop has
 * already set, so an update merges onto the existing item rather than replacing
 * it.
 */

import { id } from './db.mjs';
import { round2, roundQty, isWeighed, hasExpiry, formatQty } from './domain.mjs';

/** Beyond this a file is almost certainly not a stock list, and the write would stall the till. */
export const MAX_IMPORT_ROWS = 5000;

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const text = str(v);
  if (!text) return null;
  // Spreadsheets hand over "Rs 1,460.00" and "1 460" often enough to be worth
  // handling here rather than making a shopkeeper clean the file by hand.
  const cleaned = text.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/** Trimmed and case-folded, so "ATTA " and "atta" are the same shelf item. */
const nameKey = (name) => str(name).toLowerCase().replace(/\s+/g, ' ');

/**
 * Finds the item a row refers to.
 *
 * A barcode is unambiguous when there is one. Falling back to an exact name
 * catches loose goods, which have no barcode at all and are half the shelf.
 * Nothing fuzzier than that: a near-match that guesses wrong rewrites the price
 * of a different product, and nobody would spot it until the takings were off.
 */
export function matchProduct(products, row) {
  const barcode = str(row.barcode);
  if (barcode) {
    const byBarcode = products.find((p) => str(p.barcode) && str(p.barcode) === barcode);
    if (byBarcode) return { product: byBarcode, by: 'barcode' };
  }
  const key = nameKey(row.name);
  if (key) {
    const byName = products.find((p) => nameKey(p.name) === key);
    if (byName) return { product: byName, by: 'name' };
  }
  return { product: null, by: null };
}

/**
 * Checks one row and works out what it would do, without changing anything.
 *
 * Shared by the preview and the commit so that what the shopkeeper is shown and
 * what is actually written cannot drift apart.
 */
export function planRow(db, row, index, seenKeys, deps) {
  const line = index + 1;
  const errors = [];
  const name = str(row.name);
  if (!name) errors.push('Item name is missing.');

  const { product: existing, by: matchedBy } = matchProduct(db.products, row);

  // Two rows for the same item in one file would each add their own stock lot,
  // leaving the shop with a quantity it never counted.
  const key = str(row.barcode) ? `b:${str(row.barcode)}` : `n:${nameKey(name)}`;
  if (name && seenKeys.has(key)) {
    errors.push(`Same item as row ${seenKeys.get(key)} — merge them in the spreadsheet first.`);
  } else if (name) {
    seenKeys.set(key, line);
  }

  const unit = str(row.unit) || existing?.unit || 'piece';
  const quantity = num(row.quantity);
  const salePrice = num(row.salePrice);
  const expiry = str(row.expiry);
  if (expiry && !hasExpiry(expiry)) errors.push(`Expiry "${expiry}" is not a date.`);
  if (quantity != null && quantity < 0) errors.push('Quantity cannot be negative.');
  if (salePrice != null && salePrice < 0) errors.push('Price cannot be negative.');
  if (quantity != null && quantity > 0 && !isWeighed(unit) && !Number.isInteger(quantity)) {
    errors.push(`${name} is sold by the ${unit}, so its quantity cannot be ${quantity}.`);
  }

  // A lot is created when stock arrives, or to give a brand-new item its
  // starting price. Updating an existing item without a quantity deliberately
  // leaves its price alone: the price belongs to stock the shop has already
  // counted, and rewriting it from a supplier's list would be a silent repricing.
  const wantsLot = (quantity != null && quantity > 0) || (!existing && salePrice != null && salePrice > 0);
  if (wantsLot && !(salePrice > 0)) errors.push('A price is needed to put this item into stock.');

  let productPayload = null;
  let batchPayload = null;
  if (errors.length === 0) {
    // Only what the sheet actually said. Missing keys must not overwrite what
    // the shop has already set up.
    const given = {};
    for (const [field, value] of Object.entries({
      name,
      urduName: str(row.urduName),
      brand: str(row.brand),
      category: str(row.category),
      size: str(row.size),
      aisle: str(row.aisle),
      barcode: str(row.barcode),
      unit: str(row.unit),
    })) {
      if (value !== '') given[field] = value;
    }
    const taxRate = num(row.taxRate);
    if (taxRate != null) given.taxRate = taxRate;
    const reorderLevel = num(row.reorderLevel);
    if (reorderLevel != null) given.reorderLevel = reorderLevel;

    try {
      productPayload = existing
        ? deps.product({ ...existing, ...given }, db.settings)
        : deps.product(given, db.settings);
    } catch (err) {
      errors.push(err.message);
    }

    if (productPayload && wantsLot) {
      try {
        batchPayload = deps.batch({
          productId: existing?.id ?? 'pending',
          batchNo: str(row.batchNo),
          expiry,
          mrp: num(row.mrp) ?? 0,
          salePrice,
          costPrice: num(row.costPrice) ?? undefined,
          quantity: quantity ?? 0,
          supplier: str(row.supplier),
        }, { ...db, products: [...db.products, { ...productPayload, id: existing?.id ?? 'pending' }] });
      } catch (err) {
        errors.push(err.message);
      }
    }
  }

  const stockNow = existing
    ? db.batches
      .filter((b) => b.productId === existing.id && b.quantity > 0)
      .reduce((s, b) => s + b.quantity, 0)
    : 0;
  const adding = batchPayload ? batchPayload.quantity : 0;

  return {
    line,
    name,
    action: errors.length ? 'error' : existing ? 'update' : 'create',
    // Resolved once, here. Re-deriving it at write time would risk matching a
    // different product than the one the shopkeeper was shown in the preview.
    existingId: existing?.id ?? null,
    matchedBy,
    unit,
    errors,
    // Shown in the preview so a file imported twice by mistake is visible as a
    // doubled quantity before anything is written, not after.
    stockBefore: roundQty(stockNow, unit),
    stockAfter: roundQty(stockNow + adding, unit),
    adding: roundQty(adding, unit),
    addingLabel: formatQty(roundQty(adding, unit), unit),
    productPayload,
    batchPayload,
  };
}

/** Checks every row. Returns the plan and whether it is safe to apply. */
export function planImport(db, rows, deps) {
  const seenKeys = new Map();
  const plans = rows.map((row, index) => planRow(db, row, index, seenKeys, deps));
  return {
    plans,
    creates: plans.filter((p) => p.action === 'create').length,
    updates: plans.filter((p) => p.action === 'update').length,
    failed: plans.filter((p) => p.action === 'error').length,
  };
}

/**
 * Applies an import. Throws before writing anything if any row is bad.
 *
 * `db` here is the live draft inside writeDb, so mutating it is the write.
 */
export function applyImport(db, rows, actor, deps) {
  // `deps.bad` makes these refusals reach the shopkeeper as a readable message
  // rather than a generic server error. Being told the import failed without
  // being told which row is worse than useless when the file has 400 of them.
  const { bad, audit } = deps;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw bad('That file had no rows to import.');
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw bad(`That file has ${rows.length} rows; the most that can be imported at once is ${MAX_IMPORT_ROWS}.`);
  }

  const plan = planImport(db, rows, deps);
  if (plan.failed > 0) {
    const first = plan.plans.find((p) => p.action === 'error');
    throw bad(
      `${plan.failed} row${plan.failed === 1 ? '' : 's'} cannot be imported — row ${first.line}: ${first.errors[0]} `
      + 'Nothing was changed.',
    );
  }

  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let lots = 0;

  for (const step of plan.plans) {
    let productId;
    const existing = step.existingId ? db.products.find((p) => p.id === step.existingId) : null;

    if (existing) {
      Object.assign(existing, step.productPayload);
      productId = existing.id;
      updated += 1;
    } else {
      const product = { id: id('prd'), createdAt: now, ...step.productPayload };
      db.products.push(product);
      productId = product.id;
      created += 1;
    }

    if (step.batchPayload) {
      db.batches.push({
        id: id('bch'),
        createdAt: now,
        ...step.batchPayload,
        productId,
      });
      lots += 1;
    }
  }

  const summary = `Imported ${rows.length} row${rows.length === 1 ? '' : 's'}: `
    + `${created} new, ${updated} updated, ${lots} stock lot${lots === 1 ? '' : 's'} added`;
  audit(db, actor, 'inventory.import', summary, { rows: rows.length, created, updated, lots });

  return { rows: rows.length, created, updated, lots, summary };
}

export { round2 };
