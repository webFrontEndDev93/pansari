/** One selectable row in the shop's sales-tax rate list. */
export interface TaxRateOption {
  rate: number;
  label: string;
}

export interface Settings {
  shopName: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  email: string;
  ntn: string;
  strn: string;
  currency: string;
  currencySymbol: string;
  invoicePrefix: string;
  nextInvoiceSeq: number;
  lowStockThreshold: number;
  expiryAlertDays: number;
  defaultTaxRate: number;
  taxRates: TaxRateOption[];
  roundOffTotals: boolean;
  backupEnabled: boolean;
  backupIntervalHours: number;
  backupKeep: number;
  backupFolder: string;
  footerNote: string;
}

/** Units a shop sells in. `kg` and `litre` are weighed; the rest are counted. */
export type Unit = 'piece' | 'packet' | 'dozen' | 'kg' | 'litre';

export interface Product {
  id: string;
  name: string;
  /** So staff can search the way they speak. Never printed on the bill. */
  urduName: string;
  brand: string;
  category: string;
  /** What is on the packet — "1 litre", "950 g" — or "Loose" for weighed goods. */
  size: string;
  hsCode: string;
  taxRate: number;
  unit: Unit;
  aisle: string;
  /** In the item's own unit, so it may be fractional for anything weighed. */
  reorderLevel: number;
  barcode: string;
  notes: string;
  createdAt?: string;
}

/** A stock lot. Batch number, expiry and MRP are all optional — loose goods have none. */
export interface Batch {
  id: string;
  productId: string;
  batchNo: string;
  expiry: string;
  /** Zero means no printed price, which is the normal case for loose goods. */
  mrp: number;
  salePrice: number;
  costPrice: number;
  quantity: number;
  supplier: string;
  receivedAt: string;
  createdAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  creditBalance: number;
  createdAt?: string;
}

export interface SaleItem {
  productId: string;
  batchId: string;
  name: string;
  urduName: string;
  brand: string;
  size: string;
  batchNo: string;
  expiry: string;
  hsCode: string;
  unit: Unit;
  /** Fractional for weighed goods: 0.75 kg of daal is an ordinary line. */
  qty: number;
  mrp: number;
  salePrice: number;
  costPrice: number;
  taxRate: number;
  discountPct: number;
}

/** `credit` is udhaar — the bill goes on the customer's account, not a card. */
export type PaymentMode = 'cash' | 'card' | 'digital' | 'credit';

export interface User {
  id: string;
  name: string;
  role: 'admin' | 'staff';
  active: boolean;
  createdAt?: string;
  lastSignInAt?: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  summary: string;
  by: string;
  byId: string | null;
  role: 'admin' | 'staff' | null;
  /** Set when the action went through a manager override. */
  authorisedBy: string | null;
  invoiceNo?: string;
  amount?: number;
}

export interface Sale {
  id: string;
  invoiceNo: string;
  at: string;
  items: SaleItem[];
  gross: number;
  discount: number;
  lineDiscount: number;
  extraDiscount: number;
  taxableValue: number;
  tax: number;
  subtotal: number;
  roundOff: number;
  total: number;
  cost: number;
  profit: number;
  paymentMode: PaymentMode;
  paid: number;
  due: number;
  customerId: string | null;
  customerName: string;
  note: string;
  status: 'completed' | 'void';
  /** Who was at the till. Kept as a name so the bill never changes retroactively. */
  soldBy?: string;
  soldById?: string | null;
  voidedAt?: string;
  voidedBy?: string;
  voidedById?: string | null;
  /** The owner who approved the cancellation, when done under a manager override. */
  voidedAuthorisedBy?: string | null;
}

export interface Payment {
  id: string;
  customerId: string;
  amount: number;
  mode: 'cash' | 'card' | 'digital';
  note: string;
  at: string;
}

export interface LowStockAlert {
  productId: string;
  name: string;
  strength: string;
  stock: number;
  reorderLevel: number;
  rack: string;
}

export interface ExpiryAlert {
  batchId: string;
  productId: string;
  name: string;
  strength: string;
  batchNo: string;
  expiry: string;
  quantity: number;
  daysLeft: number;
  value: number;
}

export interface Alerts {
  lowStock: LowStockAlert[];
  expiringSoon: ExpiryAlert[];
  expired: ExpiryAlert[];
}

export interface Bootstrap {
  settings: Settings;
  /** The unit table, sent by the server so the frontend keeps no second copy. */
  units: Record<Unit, { label: string; short: string; weighed: boolean; step: number; quick: number[] }>;
  products: Product[];
  batches: Batch[];
  customers: Customer[];
  recentSales: Sale[];
  alerts: Alerts;
}

export interface ReportSummary {
  range: { from: string; to: string };
  totals: {
    revenue: number;
    profit: number;
    tax: number;
    discount: number;
    bills: number;
    itemsSold: number;
    averageBill: number;
  };
  byDay: { day: string; revenue: number; profit: number; bills: number }[];
  topProducts: { productId: string; name: string; qty: number; revenue: number; profit: number }[];
  byPaymentMode: { mode: PaymentMode; amount: number; bills: number }[];
  byUser: { name: string; revenue: number; bills: number; items: number }[];
  byHour: { hour: number; revenue: number; bills: number }[];
  stockValue: number;
  creditOutstanding: number;
}

/** A line in the in-progress bill, before it is sent to the server. */
export interface CartLine {
  key: string;
  product: Product;
  batch: Batch;
  qty: number;
  discountPct: number;
}
