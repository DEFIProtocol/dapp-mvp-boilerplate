export const PAPER_TRADING_CHAIN_ID = 84532;

export function parseNumeric(input: unknown): number | null {
  if (typeof input !== "number" || Number.isNaN(input)) return null;
  return input;
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
