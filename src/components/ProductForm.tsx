import { useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Product, Unit } from '../lib/types';
import { isWeighed, unitKeys, unitOf } from '../lib/units';
import { Button, Field, Modal } from './ui';

const CATEGORIES = [
  'Staples', 'Rice & Pulses', 'Spices', 'Dry Fruit', 'Fresh Produce', 'Dairy & Eggs',
  'Oil & Ghee', 'Tea & Beverages', 'Condiments', 'Bakery & Snacks', 'Frozen',
  'Household', 'Personal Care', 'Baby Care', 'General',
];

const blankProduct = (defaultTaxRate: number): Partial<Product> => ({
  name: '', urduName: '', brand: '', category: 'General', size: '',
  hsCode: '', taxRate: defaultTaxRate, unit: 'piece', aisle: '',
  reorderLevel: 20, barcode: '', notes: '',
});

export function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { settings, setProducts, notify, reportError } = useStore();
  const [draft, setDraft] = useState<Partial<Product>>(
    product ?? blankProduct(settings.defaultTaxRate ?? 0),
  );

  // The shop's own list, set in Settings. A rate already on this product stays
  // selectable even if it has since been removed from the list.
  const taxRates = settings.taxRates ?? [];
  const options = taxRates.some((r) => r.rate === draft.taxRate)
    ? taxRates
    : [...taxRates, { rate: draft.taxRate ?? 0, label: 'In use' }].sort((a, b) => a.rate - b.rate);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Product>(key: K, value: Product[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const weighed = isWeighed(draft.unit);
  const spec = unitOf(draft.unit);

  /**
   * Changing the unit changes what the reorder level means — 20 packets and
   * 20 kg are not the same warning. Switching between counted and weighed
   * therefore resets it to something sane for the new unit, rather than leaving
   * a number behind that now reads as an absurdity.
   */
  const changeUnit = (next: Unit) => {
    setDraft((current) => {
      const wasWeighed = isWeighed(current.unit);
      const nowWeighed = isWeighed(next);
      if (wasWeighed === nowWeighed) return { ...current, unit: next };
      return { ...current, unit: next, reorderLevel: nowWeighed ? 3 : 20 };
    });
  };

  const save = async () => {
    if (!draft.name?.trim()) return;
    setSaving(true);
    try {
      if (product) {
        const updated = await api.updateProduct(product.id, draft);
        setProducts((current) => current.map((p) => (p.id === updated.id ? updated : p)));
        notify('success', 'Item updated', updated.name);
      } else {
        const created = await api.createProduct(draft);
        setProducts((current) => [...current, created]);
        notify('success', 'Item added', `${created.name} — now add stock to give it a price and a quantity.`);
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
      title={product ? `Edit ${product.name}` : 'Add an item'}
      subtitle="Stock and prices live on stock lots, which you add separately."
      width="42rem"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!draft.name?.trim() || saving}>
            {saving ? 'Saving…' : product ? 'Save changes' : 'Add item'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="span-2">
          <Field label="Item name">
            <input className="input" value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Atta Chakki Fresh" />
          </Field>
        </div>
        <Field label="Urdu name" hint="So staff can search the way they speak. Not printed on the bill.">
          <input className="input" dir="auto" value={draft.urduName ?? ''} onChange={(e) => set('urduName', e.target.value)} placeholder="آٹا" />
        </Field>
        <Field label="Brand" hint="Leave blank for loose goods.">
          <input className="input" value={draft.brand ?? ''} onChange={(e) => set('brand', e.target.value)} placeholder="Tapal" />
        </Field>
        <Field label="Category">
          <select className="select" value={draft.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field
          label="Sold by"
          hint={weighed
            ? `Priced per ${spec.short}. Quantities may be fractional.`
            : 'Priced per item. Quantities are whole numbers.'}
        >
          <select className="select" value={draft.unit} onChange={(e) => changeUnit(e.target.value as Unit)}>
            {unitKeys().map((u) => (
              <option key={u} value={u}>{unitOf(u).label}{unitOf(u).weighed ? ' (weighed)' : ''}</option>
            ))}
          </select>
        </Field>
        <Field label="Pack size" hint={weighed ? 'Loose goods have none.' : 'What is printed on the packet.'}>
          <input className="input" value={draft.size ?? ''} onChange={(e) => set('size', e.target.value)} placeholder={weighed ? 'Loose' : '950 g'} />
        </Field>
        <Field label="Sales tax rate" hint="Prices are entered inclusive of this rate. Edit the list in Settings.">
          <select className="select" value={draft.taxRate} onChange={(e) => set('taxRate', Number(e.target.value))}>
            {options.map(({ rate, label }) => (
              <option key={rate} value={rate}>{rate}% — {label}</option>
            ))}
          </select>
        </Field>
        <Field label="Aisle / shelf" hint="Where to find it in the shop.">
          <input className="input" value={draft.aisle ?? ''} onChange={(e) => set('aisle', e.target.value)} placeholder="B3" />
        </Field>
        <Field
          label={`Reorder level (${spec.short})`}
          hint={weighed ? 'Warn when the sack drops to this weight.' : 'Warn when stock falls to this.'}
        >
          <input
            className="input input--num"
            type="number"
            min={0}
            // A weighed item reorders at a weight, so half a kilo is a real
            // reorder point and the field has to accept it.
            step={weighed ? 0.5 : 1}
            value={draft.reorderLevel ?? 0}
            onChange={(e) => set('reorderLevel', Number(e.target.value))}
          />
        </Field>
        <Field label="HS code" hint="Only needed if you file sales tax returns.">
          <input className="input" value={draft.hsCode ?? ''} onChange={(e) => set('hsCode', e.target.value)} />
        </Field>
        <div className="span-2">
          <Field label="Barcode" hint={weighed ? 'Loose goods rarely have one.' : 'Scanning this code finds the item at the till.'}>
            <input className="input mono" value={draft.barcode ?? ''} onChange={(e) => set('barcode', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
