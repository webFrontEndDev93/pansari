import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { money, todayISO } from '../lib/format';
import type { Batch, Product } from '../lib/types';
import { Button, Field, Modal } from './ui';
import { formatQty, isWeighed, unitOf } from '../lib/units';

export function BatchForm({
  product, batch, onClose,
}: {
  product: Product;
  batch: Batch | null;
  onClose: () => void;
}) {
  const { setBatches, notify, reportError } = useStore();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<Batch>>(
    batch ?? {
      productId: product.id,
      batchNo: '',
      expiry: '',
      mrp: 0,
      salePrice: 0,
      costPrice: 0,
      quantity: 0,
      supplier: '',
      receivedAt: todayISO(),
    },
  );

  const set = <K extends keyof Batch>(key: K, value: Batch[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const margin = useMemo(() => {
    const sale = Number(draft.salePrice) || 0;
    const cost = Number(draft.costPrice) || 0;
    if (sale <= 0 || cost <= 0) return null;
    return Math.round(((sale - cost) / sale) * 1000) / 10;
  }, [draft.salePrice, draft.costPrice]);

  const weighed = isWeighed(product.unit);
  const spec = unitOf(product.unit);
  const mrp = Number(draft.mrp) || 0;

  // Only the price is genuinely required. A sack of atta has no batch number,
  // no expiry and no printed MRP, and demanding them would just teach the
  // shopkeeper to type something untrue into three boxes.
  const invalid =
    !(Number(draft.salePrice) > 0) ||
    (mrp > 0 && Number(draft.salePrice) > mrp);

  const save = async () => {
    setSaving(true);
    try {
      if (batch) {
        const updated = await api.updateBatch(batch.id, draft);
        setBatches((current) => current.map((b) => (b.id === updated.id ? updated : b)));
        notify('success', 'Stock lot updated', `${product.name}${updated.batchNo ? ` · ${updated.batchNo}` : ''}`);
      } else {
        const created = await api.createBatch({ ...draft, productId: product.id });
        setBatches((current) => [...current, created]);
        notify('success', 'Stock received', `${formatQty(created.quantity, product.unit)} of ${product.name}`);
      }
      onClose();
    } catch (error) {
      reportError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={batch ? `Edit stock lot — ${product.name}` : `Receive stock — ${product.name}`}
      subtitle={weighed
        ? `Sold by weight. The price is per ${spec.short}, and includes sales tax.`
        : 'Prices include sales tax, exactly as printed on the packet.'}
      width="38rem"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={invalid || saving}>
            {saving ? 'Saving…' : batch ? 'Save lot' : 'Add to stock'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Batch number" hint="Optional — loose goods have none.">
          <input
            className="input mono"
            value={draft.batchNo ?? ''}
            onChange={(e) => set('batchNo', e.target.value.toUpperCase())}
            placeholder={weighed ? '' : 'TAP2417'}
          />
        </Field>
        <Field
          label="Expiry date"
          hint="Optional — leave blank if the item has none."
          error={draft.expiry && draft.expiry < todayISO() ? 'This date has already passed.' : undefined}
        >
          <input
            className="input"
            type="date"
            value={draft.expiry ?? ''}
            onChange={(e) => set('expiry', e.target.value)}
          />
        </Field>
        <Field label="Printed MRP" hint="Optional — loose goods have no printed price.">
          <input
            className="input input--num"
            type="number"
            step="0.01"
            min={0}
            value={draft.mrp || ''}
            onChange={(e) => set('mrp', Number(e.target.value))}
          />
        </Field>
        <Field
          label={weighed ? `Sale price per ${spec.short}` : 'Sale price'}
          error={mrp > 0 && Number(draft.salePrice) > mrp ? 'Cannot be more than the MRP.' : undefined}
          hint={weighed ? 'What one kilo or litre sells for.' : 'Leave equal to MRP if you do not discount.'}
        >
          <input
            className="input input--num"
            type="number"
            step="0.01"
            min={0}
            value={draft.salePrice || ''}
            onChange={(e) => set('salePrice', Number(e.target.value))}
          />
        </Field>
        <Field
          label={weighed ? `Purchase cost per ${spec.short}` : 'Purchase cost'}
          hint={margin === null ? 'Used for profit reporting.' : `Margin: ${margin}%`}
        >
          <input
            className="input input--num"
            type="number"
            step="0.01"
            min={0}
            value={draft.costPrice || ''}
            onChange={(e) => set('costPrice', Number(e.target.value))}
          />
        </Field>
        <Field
          label={weighed ? `Weight received (${spec.short})` : 'Quantity'}
          hint={weighed ? 'Decimals are fine — 12.5 kg is an ordinary reading.' : undefined}
        >
          <input
            className="input input--num"
            type="number"
            min={0}
            // Weighed stock is fractional, so the field has to accept a
            // fraction. Stepping by whole units would round the sack.
            step={weighed ? 0.001 : 1}
            value={draft.quantity ?? 0}
            onChange={(e) => set('quantity', Number(e.target.value))}
          />
        </Field>
        <Field label="Supplier">
          <input
            className="input"
            value={draft.supplier ?? ''}
            onChange={(e) => set('supplier', e.target.value)}
            placeholder="Akbari Mandi"
          />
        </Field>
        <Field label="Received on">
          <input
            className="input"
            type="date"
            value={draft.receivedAt ?? todayISO()}
            onChange={(e) => set('receivedAt', e.target.value)}
          />
        </Field>
        <div className="span-2">
          <div
            className="row-between"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <span className="secondary">Stock value at cost</span>
            <strong className="num">
              {money((Number(draft.quantity) || 0) * (Number(draft.costPrice) || 0))}
            </strong>
          </div>
        </div>
      </div>
    </Modal>
  );
}
