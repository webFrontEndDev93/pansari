/**
 * Tests for the money, unit and stock maths.
 *
 * Run with `npm test`. Uses node:test and node:assert, so the shop's
 * zero-dependency rule still holds — there is nothing here to install.
 *
 * Most of these exist because selling by weight makes quantities fractional,
 * and fractional quantities break assumptions that were safe when everything
 * was a whole packet: 0.1 + 0.2 is not 0.3, a customer asking for exactly the
 * last half kilo must not be refused, and a grocery batch often has no expiry
 * date at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  round3, roundQty, formatQty, lineTotals, billTotals,
  exceedsStock, isExpired, hasExpiry, sellableBatches, sellableStock,
} from './domain.mjs';

test('weights survive floating point', () => {
  assert.equal(round3(0.1 + 0.2), 0.3);
  assert.equal(roundQty(0.25, 'kg'), 0.25);
  assert.equal(roundQty(2.6, 'piece'), 3, 'a count is never fractional');
});

test('quantities read the way a shopkeeper says them', () => {
  assert.equal(formatQty(0.25, 'kg'), '250 g');
  assert.equal(formatQty(1.5, 'kg'), '1.5 kg');
  assert.equal(formatQty(0.5, 'litre'), '500 ml');
  assert.equal(formatQty(3, 'piece'), '3 pc');
});

test('a weighed line is priced per kilo', () => {
  assert.equal(lineTotals({ salePrice: 220, qty: 0.75, unit: 'kg' }).gross, 165);
  assert.equal(lineTotals({ salePrice: 299, qty: 0.333, unit: 'kg' }).gross, 99.57);
});

test('tax splits out of a tax-inclusive weighed line without losing a paisa', () => {
  const t = lineTotals({ salePrice: 220, qty: 0.75, unit: 'kg', taxRate: 18 });
  assert.equal(round3(t.taxable + t.tax), t.net);
});

test('a bill mixing weighed and counted lines adds up', () => {
  const bill = billTotals([
    { salePrice: 220, qty: 0.75, unit: 'kg', taxRate: 0 },     // 165.00
    { salePrice: 145, qty: 2, unit: 'piece', taxRate: 0 },     // 290.00
    { salePrice: 310, qty: 0.33, unit: 'kg', taxRate: 0 },     // 102.30
  ]);
  assert.equal(bill.subtotal, 557.3);
  assert.equal(bill.total, 557, 'rounds to the rupee, since paisa do not exist in a till');
});

test('a flat discount keeps the tax split honest', () => {
  const lines = [{ salePrice: 100, qty: 1, unit: 'piece', taxRate: 18 }];
  const bill = billTotals(lines, { extraDiscount: 20, roundOff: false });
  assert.equal(bill.subtotal, 100);
  assert.equal(bill.extraDiscount, 20);
  assert.equal(round3(bill.taxableValue + bill.tax), 80);
});

test('selling exactly the last half kilo is allowed', () => {
  assert.equal(exceedsStock(0.5, 0.1 + 0.4), false);
  assert.equal(exceedsStock(0.501, 0.5), true);
});

test('a grocery batch may have no expiry', () => {
  assert.equal(hasExpiry(''), false);
  assert.equal(isExpired(''), false);
  assert.equal(isExpired(null), false);
  assert.equal(isExpired('2020-01-01'), true);
});

test('dated stock leaves before undated stock, and a null expiry does not throw', () => {
  const batches = [
    { productId: 'p', quantity: 5, expiry: null, receivedAt: '2026-01-01' },
    { productId: 'p', quantity: 5, expiry: '2027-06-30', receivedAt: '2026-02-01' },
    { productId: 'p', quantity: 5, expiry: '', receivedAt: '2025-06-01' },
    { productId: 'p', quantity: 5, expiry: '2026-12-31', receivedAt: '2026-03-01' },
  ];
  assert.deepEqual(
    sellableBatches(batches, 'p').map((b) => b.expiry || 'none'),
    ['2026-12-31', '2027-06-30', 'none', 'none'],
  );
  assert.equal(sellableStock(batches, 'p'), 20);
});

test('expired stock is neither sellable nor counted', () => {
  const batches = [
    { productId: 'p', quantity: 3, expiry: '2020-01-01', receivedAt: '2019-01-01' },
    { productId: 'p', quantity: 2, expiry: '2030-01-01', receivedAt: '2026-01-01' },
  ];
  assert.equal(sellableStock(batches, 'p'), 2);
  assert.equal(sellableBatches(batches, 'p').length, 1);
});
