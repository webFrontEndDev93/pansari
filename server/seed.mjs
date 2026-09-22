import fs from 'node:fs';
import { DB_FILE, emptyDb, writeDb, readDb, resetCache, id } from './db.mjs';
import { round2, round3, roundQty, isWeighed, billTotals, nextInvoiceNo } from './domain.mjs';

/** Deterministic PRNG so a fresh clone always seeds the same demo shop. */
function rng(seed = 20260922) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A Pakistani karyana shop's shelf.
 *
 * Columns: name, Urdu name, brand, category, unit, pack size, tax rate, price,
 * shelf life in days (null when the item has no expiry at all).
 *
 * Two things to be straight about.
 *
 * The prices are plausible starting points, not researched current rates — they
 * move weekly, and every one of them is meant to be edited on day one. The tax
 * rates are the same kind of starting point: unprocessed food is generally
 * exempt and packaged branded goods generally are not, but confirm both against
 * the current Finance Act before trading on them.
 *
 * The Urdu names are there so staff can search the way they actually speak. They
 * are common words rather than anything obscure, but have a native speaker read
 * down the list once before it goes to a shop.
 */
const CATALOGUE = [
  // --- loose staples, sold by weight out of a sack
  ['Atta Chakki Fresh', 'آٹا', '', 'Staples', 'kg', 'Loose', 0, 132, null],
  ['Maida', 'میدہ', '', 'Staples', 'kg', 'Loose', 0, 158, null],
  ['Suji', 'سوجی', '', 'Staples', 'kg', 'Loose', 0, 172, null],
  ['Besan', 'بیسن', '', 'Staples', 'kg', 'Loose', 0, 284, null],
  ['Cheeni', 'چینی', '', 'Staples', 'kg', 'Loose', 0, 178, null],
  ['Namak', 'نمک', '', 'Staples', 'kg', 'Loose', 0, 58, null],
  ['Gur', 'گڑ', '', 'Staples', 'kg', 'Loose', 0, 264, null],

  // --- rice and pulses
  ['Chawal Super Kernel Basmati', 'چاول باسمتی', '', 'Rice & Pulses', 'kg', 'Loose', 0, 386, null],
  ['Chawal Sella', 'چاول سیلا', '', 'Rice & Pulses', 'kg', 'Loose', 0, 282, null],
  ['Daal Chana', 'دال چنا', '', 'Rice & Pulses', 'kg', 'Loose', 0, 318, null],
  ['Daal Masoor', 'دال مسور', '', 'Rice & Pulses', 'kg', 'Loose', 0, 294, null],
  ['Daal Moong', 'دال مونگ', '', 'Rice & Pulses', 'kg', 'Loose', 0, 342, null],
  ['Daal Mash', 'دال ماش', '', 'Rice & Pulses', 'kg', 'Loose', 0, 468, null],
  ['Safed Chana', 'سفید چنا', '', 'Rice & Pulses', 'kg', 'Loose', 0, 336, null],
  ['Lobia', 'لوبیا', '', 'Rice & Pulses', 'kg', 'Loose', 0, 306, null],

  // --- spices, weighed out in small amounts
  ['Haldi Powder', 'ہلدی', '', 'Spices', 'kg', 'Loose', 0, 612, null],
  ['Lal Mirch Powder', 'لال مرچ', '', 'Spices', 'kg', 'Loose', 0, 940, null],
  ['Dhania Powder', 'دھنیا', '', 'Spices', 'kg', 'Loose', 0, 704, null],
  ['Zeera', 'زیرہ', '', 'Spices', 'kg', 'Loose', 0, 1680, null],
  ['Kali Mirch', 'کالی مرچ', '', 'Spices', 'kg', 'Loose', 0, 2450, null],
  ['Elaichi Sabz', 'الائچی', '', 'Spices', 'kg', 'Loose', 0, 9200, null],

  // --- dry fruit
  ['Badam', 'بادام', '', 'Dry Fruit', 'kg', 'Loose', 0, 2680, null],
  ['Akhrot', 'اخروٹ', '', 'Dry Fruit', 'kg', 'Loose', 0, 1840, null],
  ['Kishmish', 'کشمش', '', 'Dry Fruit', 'kg', 'Loose', 0, 1240, null],
  ['Chilgoza', 'چلغوزہ', '', 'Dry Fruit', 'kg', 'Loose', 0, 8600, null],

  // --- fresh produce, weighed and short-lived
  ['Aloo', 'آلو', '', 'Fresh Produce', 'kg', 'Loose', 0, 92, 10],
  ['Pyaz', 'پیاز', '', 'Fresh Produce', 'kg', 'Loose', 0, 124, 14],
  ['Tamatar', 'ٹماٹر', '', 'Fresh Produce', 'kg', 'Loose', 0, 156, 5],
  ['Lehsan', 'لہسن', '', 'Fresh Produce', 'kg', 'Loose', 0, 690, 21],
  ['Adrak', 'ادرک', '', 'Fresh Produce', 'kg', 'Loose', 0, 620, 14],
  ['Hari Mirch', 'ہری مرچ', '', 'Fresh Produce', 'kg', 'Loose', 0, 210, 4],
  ['Nimbu', 'لیموں', '', 'Fresh Produce', 'kg', 'Loose', 0, 298, 7],

  // --- dairy and eggs
  ['Doodh Khula', 'دودھ', '', 'Dairy & Eggs', 'litre', 'Loose', 0, 224, 2],
  ["Olper's Milk", 'دودھ', "Olper's", 'Dairy & Eggs', 'piece', '1 litre', 18, 330, 90],
  ['Nestlé Milkpak', 'دودھ', 'Nestlé', 'Dairy & Eggs', 'piece', '1 litre', 18, 328, 90],
  ['Nurpur Butter', 'مکھن', 'Nurpur', 'Dairy & Eggs', 'piece', '200 g', 18, 486, 120],
  ['Anday Desi', 'انڈے', '', 'Dairy & Eggs', 'dozen', 'Dozen', 0, 382, 21],
  ['Nido Milk Powder', '', 'Nestlé', 'Dairy & Eggs', 'piece', '900 g', 18, 2240, 270],

  // --- cooking oil and ghee
  ['Dalda Banaspati', 'گھی', 'Dalda', 'Oil & Ghee', 'piece', '1 kg', 18, 612, 365],
  ['Sufi Cooking Oil', 'تیل', 'Sufi', 'Oil & Ghee', 'piece', '5 litre', 18, 2840, 365],
  ['Kisan Cooking Oil Pouch', 'تیل', 'Kisan', 'Oil & Ghee', 'piece', '1 litre', 18, 596, 365],

  // --- tea, drinks
  ['Tapal Danedar', 'چائے', 'Tapal', 'Tea & Beverages', 'piece', '950 g', 18, 1460, 365],
  ['Lipton Yellow Label', 'چائے', 'Lipton', 'Tea & Beverages', 'piece', '475 g', 18, 912, 365],
  ['Chai Patti Khuli', 'چائے', '', 'Tea & Beverages', 'kg', 'Loose', 0, 1420, null],
  ['Coca-Cola', '', 'Coca-Cola', 'Tea & Beverages', 'piece', '1.5 litre', 18, 232, 180],
  ['Nestlé Pure Life', 'پانی', 'Nestlé', 'Tea & Beverages', 'piece', '1.5 litre', 18, 92, 365],
  ['Rooh Afza', 'روح افزا', 'Hamdard', 'Tea & Beverages', 'piece', '800 ml', 18, 704, 540],
  ['Tang Orange', '', 'Tang', 'Tea & Beverages', 'piece', '750 g', 18, 892, 365],

  // --- condiments and packets
  ['Shan Biryani Masala', 'مصالحہ', 'Shan', 'Condiments', 'piece', '50 g', 18, 122, 540],
  ['National Chaat Masala', 'مصالحہ', 'National', 'Condiments', 'piece', '100 g', 18, 184, 540],
  ['National Ketchup', '', 'National', 'Condiments', 'piece', '800 g', 18, 598, 365],
  ['National Mango Pickle', 'اچار', 'National', 'Condiments', 'piece', '1 kg', 18, 556, 540],
  ['Kolson Macaroni', '', 'Kolson', 'Condiments', 'piece', '400 g', 18, 178, 365],
  ['Knorr Chicken Noodles', '', 'Knorr', 'Condiments', 'packet', '66 g', 18, 92, 270],

  // --- bakery and snacks
  ['Double Roti', 'ڈبل روٹی', '', 'Bakery & Snacks', 'piece', 'Large', 0, 180, 3],
  ['Peek Freans Sooper', '', 'Peek Freans', 'Bakery & Snacks', 'packet', 'Family', 18, 124, 180],
  ['LU Candi', '', 'LU', 'Bakery & Snacks', 'packet', 'Family', 18, 118, 180],
  ["Lay's Masala", '', "Lay's", 'Bakery & Snacks', 'packet', '40 g', 18, 102, 120],

  // --- household and personal care
  ['Surf Excel', '', 'Surf Excel', 'Household', 'piece', '1 kg', 18, 712, null],
  ['Harpic', '', 'Harpic', 'Household', 'piece', '500 ml', 18, 404, null],
  ['Rose Petal Tissues', '', 'Rose Petal', 'Household', 'piece', '150 pulls', 18, 158, null],
  ['Lifebuoy Soap', 'صابن', 'Lifebuoy', 'Personal Care', 'piece', '130 g', 18, 182, null],
  ['Colgate Toothpaste', '', 'Colgate', 'Personal Care', 'piece', '100 g', 18, 306, 730],
  ['Sunsilk Shampoo', '', 'Sunsilk', 'Personal Care', 'piece', '185 ml', 18, 452, 730],
  ['Dettol Antiseptic', '', 'Dettol', 'Personal Care', 'piece', '250 ml', 18, 458, 730],
];

const CUSTOMERS = [
  ['Muhammad Asif', '+92 300 4412876', 'G-9 Markaz'],
  ['Ayesha Siddiqui', '+92 321 5523987', 'F-11 Markaz'],
  ['Bilal Ahmed Khan', '+92 333 6634098', 'I-8/3'],
  ['Fatima Noor', '+92 345 7745109', 'E-11/2'],
  ['Usman Ghani', '+92 301 8856210', 'Bahria Town Phase 4'],
  ['Hina Shahzad', '+92 322 9967321', 'DHA Phase 2'],
  ['Kamran Yousaf', '+92 334 1078432', 'G-11/3'],
  ['Nadia Baig', '+92 346 2189543', 'F-10 Markaz'],
  ['Tariq Mehmood', '+92 302 3290654', 'Saddar, Rawalpindi'],
  ['Zainab Rizvi', '+92 323 4301765', 'F-7/2'],
];

const SUPPLIERS = ['Akbari Mandi', 'Sabzi Mandi I-11', 'Metro Cash & Carry', 'Local Distributor'];

const isoDay = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

/** The shelf itself, which is the same whichever way a shop starts. */
function buildProducts(rand, between) {
  return CATALOGUE.map(
    ([name, urduName, brand, category, unit, size, taxRate, price, shelfLife]) => ({
      id: id('prd'),
      name,
      urduName,
      brand,
      category,
      size,
      hsCode: '',
      taxRate,
      unit,
      aisle: `${String.fromCharCode(65 + between(0, 5))}${between(1, 6)}`,
      // A weighed item reorders in kilos and a counted one in pieces, so the
      // two cannot share a number: 20 kg of elaichi would be absurd, and
      // 2 packets of biscuits would have the shop reordering every afternoon.
      reorderLevel: isWeighed(unit) ? between(2, 6) : between(6, 24),
      barcode: brand ? String(8_960_000_000_000 + between(100000, 999999)) : '',
      notes: '',
      createdAt: new Date().toISOString(),
      _price: price,
      _shelfLife: shelfLife,
    }),
  );
}

/**
 * A shop mid-life: stock on the shelves, regulars on the books and ten weeks of
 * trade behind it. This is for looking at the app, not for opening one — every
 * number in it is invented. Reach it with --demo.
 */
export function buildDemo() {
  const rand = rng();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  const db = emptyDb();
  const products = buildProducts(rand, between);

  const batches = [];
  for (const product of products) {
    const weighed = isWeighed(product.unit);
    const count = weighed ? 1 : between(1, 2);
    for (let i = 0; i < count; i += 1) {
      const salePrice = round2(product._price * (1 + (i * between(1, 4)) / 100));
      // Perishables get dates near enough to be interesting; a handful are
      // already past, so the expiry alerts have something to show.
      let expiry = '';
      if (product._shelfLife) {
        const roll = rand();
        const span = product._shelfLife;
        expiry = isoDay(roll < 0.08 ? -between(1, 4) : between(Math.ceil(span / 4), span));
      }
      batches.push({
        id: id('bch'),
        productId: product.id,
        batchNo: product.brand ? `${product.brand.slice(0, 3).toUpperCase()}${between(1000, 9999)}` : '',
        expiry,
        mrp: product.brand ? round2(salePrice * 1.04) : 0,
        salePrice,
        costPrice: round2(salePrice * (0.8 + rand() * 0.1)),
        // Loose stock is a weight, so it is fractional: 18.4 kg left in the
        // sack, not 18.
        quantity: weighed ? round3(between(4, 60) + rand()) : between(6, 80),
        supplier: pick(SUPPLIERS),
        receivedAt: isoDay(-between(1, 45)),
        createdAt: new Date().toISOString(),
      });
    }
  }
  for (const product of products) { delete product._price; delete product._shelfLife; }

  const customers = CUSTOMERS.map(([name, phone, address]) => ({
    id: id('cus'),
    name,
    phone,
    email: '',
    address: `${address}, Islamabad`,
    notes: '',
    creditBalance: 0,
    createdAt: new Date().toISOString(),
  }));

  db.products = products;
  db.batches = batches;
  db.customers = customers;

  // Replay ~60 days of trade so the reports open with a real-looking history.
  const sales = [];
  for (let dayOffset = 60; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const friday = date.getDay() === 5;
    const billCount = between(friday ? 10 : 6, friday ? 24 : 16);

    for (let b = 0; b < billCount; b += 1) {
      const lines = [];
      const lineCount = between(1, 6);
      for (let l = 0; l < lineCount; l += 1) {
        const batch = pick(batches);
        if (batch.quantity <= 0) continue;
        const product = products.find((p) => p.id === batch.productId);
        const weighed = isWeighed(product.unit);
        // A customer asks for a quarter, a half or a kilo far more often than
        // for 0.37 kg, so the demo buys the way people actually buy.
        const want = weighed
          ? pick([0.25, 0.5, 0.5, 1, 1, 1, 2])
          : between(1, 3);
        const qty = roundQty(Math.min(want, batch.quantity), product.unit);
        if (qty <= 0) continue;
        batch.quantity = Math.max(0, round3(batch.quantity - qty));
        lines.push({
          productId: product.id,
          batchId: batch.id,
          name: product.name,
          urduName: product.urduName,
          brand: product.brand,
          size: product.size,
          batchNo: batch.batchNo,
          expiry: batch.expiry,
          hsCode: product.hsCode,
          unit: product.unit,
          qty,
          mrp: batch.mrp,
          salePrice: batch.salePrice,
          costPrice: batch.costPrice,
          taxRate: product.taxRate,
          discountPct: 0,
        });
      }
      if (lines.length === 0) continue;

      const totals = billTotals(lines, { extraDiscount: 0, roundOff: true });
      const at = new Date(date);
      at.setHours(between(9, 21), between(0, 59), 0, 0);

      const hasCustomer = rand() < 0.3;
      const customer = hasCustomer ? pick(customers) : null;
      const mode = customer && rand() < 0.35 ? 'credit' : pick(['cash', 'cash', 'cash', 'digital', 'card']);
      const paid = mode === 'credit' ? round2(totals.total * (rand() < 0.5 ? 0 : 0.5)) : totals.total;
      const due = round2(totals.total - paid);
      if (customer && due > 0) customer.creditBalance = round2((customer.creditBalance ?? 0) + due);

      const cost = round2(lines.reduce((s, x) => s + x.costPrice * x.qty, 0));
      sales.push({
        id: id('sale'),
        invoiceNo: nextInvoiceNo({ ...db.settings, nextInvoiceSeq: sales.length + 1 }),
        at: at.toISOString(),
        items: lines,
        ...totals,
        cost,
        profit: round2(totals.taxableValue - cost),
        paymentMode: mode,
        paid,
        due,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? 'Walk-in',
        note: '',
        status: 'completed',
        soldBy: pick(['Owner', 'Counter']),
        soldById: null,
      });
    }
  }
  db.sales = sales.sort((a, b) => b.at.localeCompare(a.at));
  db.settings.nextInvoiceSeq = sales.length + 1;

  // Most credit gets paid off; leaving every customer in debt would be a
  // caricature of a shop, and it hides the payments ledger entirely.
  const payments = [];
  for (const customer of customers) {
    if (customer.creditBalance <= 0) continue;
    const roll = rand();
    const share = roll < 0.45 ? 1 : roll < 0.75 ? 0.4 + rand() * 0.4 : 0;
    if (share === 0) continue;

    const amount = round2(customer.creditBalance * share);
    if (amount <= 0) continue;
    const when = new Date();
    when.setDate(when.getDate() - between(1, 30));
    when.setHours(between(10, 20), between(0, 59), 0, 0);

    customer.creditBalance = round2(customer.creditBalance - amount);
    payments.push({
      id: id('pay'),
      customerId: customer.id,
      amount,
      mode: pick(['cash', 'cash', 'digital']),
      note: share === 1 ? 'Account cleared' : 'Part payment',
      at: when.toISOString(),
    });
  }
  db.payments = payments.sort((a, b) => b.at.localeCompare(a.at));

  return db;
}

/**
 * What a new shop actually opens with: the catalogue, and one empty lot per item
 * holding a starting price. No customers, no bills, no takings — those belong to
 * whoever trades here, not to a demo.
 *
 * The lots are priced but carry no stock on purpose. Nothing can be sold from a
 * lot with no quantity, so the first thing anyone does with an item is open it
 * and enter what is actually on the shelf or in the sack — which is the same
 * moment they correct the price and, for a perishable, put in a real date. A
 * weight nobody weighed never reaches a report that way.
 */
export function buildStarter() {
  const rand = rng();
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  const db = emptyDb();
  const products = buildProducts(rand, between);

  const batches = products.map((product) => ({
    id: id('bch'),
    productId: product.id,
    // Loose goods out of a sack have no batch number and never will, so this
    // stays blank rather than inventing one for the shopkeeper to wonder about.
    batchNo: product.brand ? 'OPENING' : '',
    // Only a perishable gets a placeholder date, and the shop replaces it with
    // the one printed on the carton the first time it enters real stock.
    expiry: product._shelfLife ? isoDay(product._shelfLife) : '',
    mrp: 0,
    salePrice: round2(product._price),
    costPrice: round2(product._price * 0.85),
    quantity: 0,
    supplier: '',
    receivedAt: isoDay(0),
    createdAt: new Date().toISOString(),
  }));
  for (const product of products) { delete product._price; delete product._shelfLife; }

  db.products = products;
  db.batches = batches;
  return db;
}

/**
 * Writes the starting data only when there is no database yet, or when --force
 * is passed. --demo asks for the invented shop instead of a clean catalogue.
 */
export function ensureSeed() {
  const force = process.argv.includes('--force');
  const demo = process.argv.includes('--demo');
  const exists = fs.existsSync(DB_FILE);
  if (exists && !force) {
    const db = readDb();
    if (db.products.length > 0) return false;
  }
  const seeded = demo ? buildDemo() : buildStarter();
  resetCache();
  // Returned, not fired and forgotten: the caller awaits this so a data folder
  // it cannot write to becomes a clear startup message rather than an
  // unhandled rejection.
  const written = writeDb((db) => {
    Object.assign(db, seeded);
  }).then(() => {
    console.log(
      demo
        ? `[seed] demo shop ready — ${seeded.products.length} items, ${seeded.batches.length} lots, ${seeded.sales.length} bills, ${seeded.payments.length} credit settlements.`
        : `[seed] starter catalogue ready — ${seeded.products.length} items priced, no stock, no customers, no sales. Enter what is on the shelf to begin.`,
    );
    return true;
  });
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureSeed();
}
