// backend/oracle/types/oracle.ts
export interface RoundData {
  roundId: string;
  price: number;
  timestamp: number;
  startedAt: number;
  answeredInRound?: string;
}

// Keep only the feeds you need
export const PRIORITY_FEEDS: Record<string, Record<string, string>> = {
  ethereum: {
    'btc': '0xf4030086522a5beea4988f8ca5b36dbc97beee88c',
    'eth': '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419',
    'sol': '0x4ffc43a60e009b551865a1d223e6c8fb9d9b3c8e',
  },
  polygon: {
    'btc': '0xc907e116054ad103354f2d350fd2514433d57f6f',
    'eth': '0xf9680d99d6c9589e2a93a78a04a279e509205945',
    'sol': '0x10c8264c0935b3b9870013e057f330ff3d9b3132',
  }
};

export function getFeedAddress(chain: string, token: string): string | null {
  const chainFeeds = PRIORITY_FEEDS[chain.toLowerCase()];
  if (!chainFeeds) return null;
  return chainFeeds[token.toLowerCase()] || null;
}