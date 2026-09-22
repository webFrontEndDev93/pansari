import { formatDateTime, formatMonthYear, money, plain } from '../lib/format';
import type { Sale, Settings } from '../lib/types';
import { formatQty, priceSuffix } from '../lib/units';

const MODE_LABEL: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  digital: 'Digital',
  credit: 'Udhaar (on account)',
  // Bills written before the tender was renamed still print sensibly.
  upi: 'Digital',
};

/**
 * Thermal-printer styled bill. The `.receipt` print rules in billing.css hide
 * the rest of the app, so window.print() emits just this at 80mm.
 */
export function Receipt({ sale, settings }: { sale: Sale; settings: Settings }) {
  const savings = sale.items.reduce((s, i) => s + (i.mrp - i.salePrice) * i.qty, 0) + sale.discount;
  // One rate on most bills, so print it; a mixed bill just says "Sales tax".
  const rates = [...new Set(sale.items.map((i) => i.taxRate))].sort((a, b) => a - b);
  const taxRates = rates.length === 1 ? `${rates[0]}%` : '';

  return (
    <div className="receipt">
      <div className="receipt-center">
        <div className="receipt-shop">{settings.shopName}</div>
        {settings.addressLine1 && <div>{settings.addressLine1}</div>}
        {settings.addressLine2 && <div>{settings.addressLine2}</div>}
        {settings.phone && <div>Ph: {settings.phone}</div>}
        {settings.ntn && <div>NTN: {settings.ntn}</div>}
        {settings.strn && <div>STRN: {settings.strn}</div>}
      </div>

      <hr className="receipt-rule" />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Bill: {sale.invoiceNo}</span>
        <span>{formatDateTime(sale.at)}</span>
      </div>
      <div>Customer: {sale.customerName || 'Walk-in'}</div>
      {sale.soldBy && <div>Served by: {sale.soldBy}</div>}

      <hr className="receipt-rule" />

      <table>
        <thead>
          <tr>
            <th style={{ width: '44%' }}>Item</th>
            <th className="r">Qty</th>
            <th className="r">Rate</th>
            <th className="r">Amt</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => {
            const net = item.salePrice * item.qty * (1 - item.discountPct / 100);
            return (
              <tr key={`${item.batchId}-${index}`}>
                <td>
                  {item.name}
                  {item.size && item.size !== 'Loose' ? ` ${item.size}` : ''}
                  {/* A slip that only says "B: · Exp —" for a scoop of daal is
                      noise. Each part appears only when it exists. */}
                  {(item.batchNo || item.expiry || item.discountPct > 0) && (
                    <>
                      <br />
                      <span style={{ fontSize: 10, color: '#555' }}>
                        {[
                          item.batchNo && `B:${item.batchNo}`,
                          item.expiry && `Exp ${formatMonthYear(item.expiry)}`,
                          item.discountPct > 0 && `-${item.discountPct}%`,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </>
                  )}
                </td>
                {/* The weight is the thing the customer is checking, so it is
                    printed the way they asked for it: 750 g, not 0.75. */}
                <td className="r">{formatQty(item.qty, item.unit)}</td>
                <td className="r">{plain(item.salePrice)}{priceSuffix(item.unit)}</td>
                <td className="r">{plain(net)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <hr className="receipt-rule" />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Gross</span><span>{plain(sale.gross)}</span>
      </div>
      {sale.discount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Discount</span><span>-{plain(sale.discount)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Taxable value</span><span>{plain(sale.taxableValue)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Sales tax{taxRates && ` (${taxRates})`}</span><span>{plain(sale.tax)}</span>
      </div>
      {sale.roundOff !== 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Round off</span><span>{plain(sale.roundOff)}</span>
        </div>
      )}

      <hr className="receipt-rule" />

      <div className="receipt-total">
        <span>TOTAL</span><span>{money(sale.total)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Paid ({MODE_LABEL[sale.paymentMode] ?? sale.paymentMode})</span><span>{plain(sale.paid)}</span>
      </div>
      {sale.due > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Balance due</span><span>{plain(sale.due)}</span>
        </div>
      )}
      {savings > 0 && (
        <div className="receipt-center" style={{ marginTop: 6 }}>
          You saved {money(savings)} on this bill
        </div>
      )}

      <hr className="receipt-rule" />

      <div className="receipt-center" style={{ fontSize: 10 }}>
        <div style={{ marginTop: 4 }}>{settings.footerNote}</div>
        <div style={{ marginTop: 6, fontWeight: 700 }}>Shukriya · Thank you</div>
      </div>
    </div>
  );
}
