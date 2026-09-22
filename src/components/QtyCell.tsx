/**
 * The quantity control for one cart line.
 *
 * A counted item and a weighed item want different things at a counter. For
 * packets, the shopkeeper taps + until it matches what is in front of them. For
 * loose goods they already know the number — it is on the scale — so the fast
 * path is typing it, with one-tap keys for the amounts people actually ask for.
 * Forcing weight through a +/- stepper would mean sixteen taps for 400 g.
 *
 * Weighed input is in grams rather than kilos, because that is the number on the
 * scale and the number the customer said. The line stores kilos; only this
 * control deals in grams.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { formatQty, isWeighed, round3, unitOf } from '../lib/units';
import type { Unit } from '../lib/types';

interface Props {
  qty: number;
  unit: Unit;
  /** Stock left for this lot, already minus what the rest of this bill claims. */
  ceiling: number;
  name: string;
  onChange: (qty: number) => void;
}

export function QtyCell({ qty, unit, ceiling, name, onChange }: Props) {
  const spec = unitOf(unit);
  const weighed = isWeighed(unit);
  const remaining = round3(Math.max(0, ceiling - qty));

  if (!weighed) {
    return (
      <>
        <div className="stepper">
          <button
            type="button"
            onClick={() => onChange(qty - 1)}
            disabled={qty <= 1}
            aria-label="Decrease quantity"
          >
            <Icon name="minus" size={13} />
          </button>
          <input
            type="number"
            value={qty}
            min={1}
            max={ceiling}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={`Quantity of ${name}`}
          />
          <button
            type="button"
            onClick={() => onChange(qty + 1)}
            disabled={qty >= ceiling}
            aria-label="Increase quantity"
          >
            <Icon name="plus" size={13} />
          </button>
        </div>
        <div className="cell-sub">{formatQty(remaining, unit)} more in stock</div>
      </>
    );
  }

  return (
    <>
      <WeightInput qty={qty} unit={unit} ceiling={ceiling} name={name} onChange={onChange} />
      <div className="qty-quick">
        {spec.quick.map((amount) => (
          <button
            key={amount}
            type="button"
            className="qty-chip"
            disabled={amount > ceiling}
            onClick={() => onChange(amount)}
            aria-label={`Set to ${formatQty(amount, unit)}`}
          >
            {formatQty(amount, unit)}
          </button>
        ))}
      </div>
      <div className="cell-sub">{formatQty(remaining, unit)} more in stock</div>
    </>
  );
}

/**
 * Typed in grams, stored in kilos.
 *
 * The field keeps its own draft string while it has focus. Without that, typing
 * "1" on the way to "150" would immediately round-trip through the parent as
 * 0.001 kg and fight the next keystroke — the value would jump around under the
 * shopkeeper's fingers mid-number.
 */
function WeightInput({ qty, unit, ceiling, name, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const spec = unitOf(unit);
  const small = unit === 'litre' ? 'ml' : 'g';
  const inputRef = useRef<HTMLInputElement>(null);

  // When the parent changes the quantity while the field is focused — a quick
  // key, or a stock clamp — the draft has to follow, or the box would keep
  // showing what was typed rather than what the line now holds.
  useEffect(() => {
    if (draft !== null && document.activeElement !== inputRef.current) setDraft(null);
  }, [qty, draft]);

  const shown = draft ?? String(Math.round(qty * 1000));

  const commit = (text: string) => {
    const grams = Number(text);
    if (!Number.isFinite(grams) || grams <= 0) {
      setDraft(null);
      return;
    }
    onChange(round3(grams / 1000));
    setDraft(null);
  };

  return (
    <div className="weigh">
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        className="weigh-input"
        value={shown}
        min={1}
        max={Math.round(ceiling * 1000)}
        step={Math.round(spec.step * 1000)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={`Weight of ${name} in ${small}`}
      />
      <span className="weigh-unit">{small}</span>
    </div>
  );
}
