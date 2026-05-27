export function parseMoney(value: string): bigint {
  if (!/^-?\d{1,12}(\.\d{1,2})?$/u.test(value)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function formatMoney(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

export function addMoney(values: readonly string[]): string {
  return formatMoney(values.reduce((sum, value) => sum + parseMoney(value), 0n));
}

export function compareMoney(left: string, right: string): number {
  const diff = parseMoney(left) - parseMoney(right);
  return diff === 0n ? 0 : diff > 0n ? 1 : -1;
}

export function subtractMoney(left: string, right: string): string {
  return formatMoney(parseMoney(left) - parseMoney(right));
}
