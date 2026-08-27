export const PAPER_TRADING_CHAIN_ID = 84532;

export function parseNumeric(input: unknown): number | null {
  if (typeof input !== "number" || Number.isNaN(input)) return null;
  return input;
}

/**
 * Parse a value that must be a non-negative integer but may exceed
 * Number.MAX_SAFE_INTEGER (e.g. order nonces, which are generated as
 * bigint millisecond-based timestamps and therefore sent over the wire
 * as numeric strings to avoid precision loss). Accepts a JS number, a
 * bigint, or a numeric string; returns the value as a string suitable
 * for storing in a NUMERIC(30, 0) column, or null if invalid.
 */
export function parseBigNumeric(input: unknown): string | null {
  if (typeof input === "bigint") {
    return input < 0n ? null : input.toString();
  }

  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return null;
    return input.toString();
  }

  if (typeof input === "string" && /^\d+$/.test(input)) {
    return input;
  }

  return null;
}

function parseChainId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function ensurePaperTradingChain(
  chainId: unknown
): { ok: true } | { ok: false; message: string } {
  const parsed = parseChainId(chainId);
  if (parsed === null) {
    return { ok: false, message: "chainId is required and must be a positive integer" };
  }

  if (parsed !== PAPER_TRADING_CHAIN_ID) {
    return { ok: false, message: "paper trading endpoints are restricted to Base Sepolia (84532)" };
  }

  return { ok: true };
}
