import Decimal from "decimal.js";

// All money math goes through decimal.js with banker-free half-up rounding to 2dp, matching
// PostgreSQL's round(numeric, 2). Floats are never used for financial values.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Decimal.Value;

export function money(value: MoneyInput | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  return new Decimal(value);
}

export function round2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Serialises a Decimal as a fixed 2dp string, the format PostgREST accepts for numeric. */
export function toMoneyString(value: Decimal): string {
  return round2(value).toFixed(2);
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), new Decimal(0));
}

export { Decimal };
