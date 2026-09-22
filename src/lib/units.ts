/**
 * How the app understands units.
 *
 * The table itself is NOT defined here. It arrives from the server in the
 * bootstrap payload and is installed once, before anything renders, because
 * what "kg" means — that it is weighed, steps by 0.25, and may be fractional —
 * has to mean exactly one thing on both sides of the wire. A second copy of it
 * in TypeScript would be free to drift away from the one the server validates
 * and stores against, and the symptom would be a shop whose screen and whose
 * records disagree about how much daal it sold.
 */
import type { Unit } from './types';

export interface UnitSpec {
  label: string;
  short: string;
  weighed: boolean;
  step: number;
  quick: number[];
}

export type UnitTable = Partial<Record<Unit, UnitSpec>>;

/** Until bootstrap lands nothing is rendered, so an empty table is never read. */
let TABLE: UnitTable = {};

export const setUnitTable = (table: UnitTable) => { TABLE = table ?? {}; };

const FALLBACK: UnitSpec = { label: 'Piece', short: 'pc', weighed: false, step: 1, quick: [1, 2, 5, 10] };

export const unitOf = (unit: Unit | string | undefined): UnitSpec =>
  TABLE[unit as Unit] ?? FALLBACK;

export const isWeighed = (unit: Unit | string | undefined): boolean => unitOf(unit).weighed;

export const unitKeys = (): Unit[] => Object.keys(TABLE) as Unit[];

/** Quantities to the gram, matching the server. */
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Rounds a quantity the way its unit allows: grams for weight, whole things otherwise. */
export function roundQty(qty: number, unit: Unit | string | undefined): number {
  if (!Number.isFinite(qty)) return 0;
  return isWeighed(unit) ? round3(qty) : Math.round(qty);
}

/**
 * How a quantity reads on screen and on the bill.
 *
 * Under a kilo a shopkeeper says grams, not 0.25 kg, so that is what is shown —
 * the customer is checking the slip against what they asked for.
 */
export function formatQty(qty: number, unit: Unit | string | undefined): string {
  const n = Number(qty) || 0;
  const spec = unitOf(unit);
  if (!spec.weighed) return `${Math.round(n)} ${spec.short}`;
  if (n > 0 && n < 1) {
    const small = Math.round(n * 1000);
    return unit === 'litre' ? `${small} ml` : `${small} g`;
  }
  return `${round3(n)} ${spec.short}`;
}

/** "Rs 320 / kg" for weighed goods, plain money for the rest. */
export const priceSuffix = (unit: Unit | string | undefined): string => {
  const spec = unitOf(unit);
  return spec.weighed ? ` / ${spec.short}` : '';
};
