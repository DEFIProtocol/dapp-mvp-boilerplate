// backend/oracle/oracleService.ts
import { ethers } from 'ethers';
import NodeCache from 'node-cache';
import { RoundData, getFeedAddress } from './types/oracle';

const AGGREGATOR_V3_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)"
];

export class OracleService {
  private cache: NodeCache;
  private providers: Map<string, ethers.JsonRpcProvider>;
  private infuraProjectId: string;

  constructor() {
    this.cache = new NodeCache({ stdTTL: 30 });
    this.providers = new Map();
    this.infuraProjectId = process.env.INFURA_PRIVATE_KEY || '';
    this.initProviders();
  }

  private getInfuraUrl(chainName: string): string | null {
    const networkMap: Record<string, string> = {
      'ethereum': 'mainnet',
      'polygon': 'polygon-mainnet',
      'arbitrum': 'arbitrum-mainnet',
      'avalanche': 'avalanche-mainnet'
    };
    
    const network = networkMap[chainName];
    if (!network || !this.infuraProjectId) return null;
    return `https://${network}.infura.io/v3/${this.infuraProjectId}`;
  }

  private initProviders(): void {
    const chains = ['ethereum', 'polygon', 'bsc'];
    
    for (const chain of chains) {
      try {
        let provider: ethers.JsonRpcProvider | null = null;
        
        // Try Infura first
        const infuraUrl = this.getInfuraUrl(chain);
        if (infuraUrl) {
          try {
            provider = new ethers.JsonRpcProvider(infuraUrl);
            console.log(`✅ Infura provider for ${chain}`);
          } catch (error) {
            console.log(`⚠️ Infura failed for ${chain}`);
          }
        }
        
        // Fallback
        if (!provider) {
          const fallbackUrls: Record<string, string> = {
            'ethereum': 'https://eth.llamarpc.com',
            'polygon': 'https://polygon.llamarpc.com',
            'bsc': 'https://bsc.llamarpc.com'
          };
          
          const url = fallbackUrls[chain];
          if (url) {
            provider = new ethers.JsonRpcProvider(url);
            console.log(`✅ Fallback provider for ${chain}`);
          }
        }
        
        if (provider) this.providers.set(chain, provider);
      } catch (error) {
        console.error(`Failed to initialize provider for ${chain}:`, error);
      }
    }
  }

  async getLatestRound(chain: string, token: string): Promise<RoundData | null> {
    const cacheKey = `latest:${chain}:${token}`;
    const cached = this.cache.get<RoundData>(cacheKey);
    if (cached) return cached;

    try {
      const provider = this.providers.get(chain);
      if (!provider) throw new Error(`No provider for chain: ${chain}`);

      const feedAddress = getFeedAddress(chain, token);
      if (!feedAddress) throw new Error(`No feed for ${token} on ${chain}`);

      const contract = new ethers.Contract(feedAddress, AGGREGATOR_V3_ABI, provider);
      
      const [roundData, decimals] = await Promise.all([
        contract.latestRoundData(),
        contract.decimals()
      ]);

      const result: RoundData = {
        roundId: roundData.roundId.toString(),
        price: Number(ethers.formatUnits(roundData.answer, decimals)),
        timestamp: Number(roundData.updatedAt) * 1000,
        startedAt: Number(roundData.startedAt) * 1000,
        answeredInRound: roundData.answeredInRound?.toString()
      };

      this.cache.set(cacheKey, result, 15); // 15 second cache
      return result;
    } catch (error) {
      console.error(`Error fetching latest ${token} on ${chain}:`, error);
      return null;
    }
  }

  async getRoundData(chain: string, token: string, roundId: string): Promise<RoundData | null> {
    const cacheKey = `round:${chain}:${token}:${roundId}`;
    const cached = this.cache.get<RoundData>(cacheKey);
    if (cached) return cached;

    try {
      const provider = this.providers.get(chain);
      if (!provider) throw new Error(`No provider for chain: ${chain}`);

      const feedAddress = getFeedAddress(chain, token);
      if (!feedAddress) throw new Error(`No feed for ${token} on ${chain}`);

      const contract = new ethers.Contract(feedAddress, AGGREGATOR_V3_ABI, provider);
      
      const [roundData, decimals] = await Promise.all([
        contract.getRoundData(BigInt(roundId)),
        contract.decimals()
      ]);

      const result: RoundData = {
        roundId: roundData.roundId.toString(),
        price: Number(ethers.formatUnits(roundData.answer, decimals)),
        timestamp: Number(roundData.updatedAt) * 1000,
        startedAt: Number(roundData.startedAt) * 1000,
        answeredInRound: roundData.answeredInRound?.toString()
      };

      this.cache.set(cacheKey, result, 300); // 5 minute cache for historical
      return result;
    } catch (error) {
      console.error(`Error fetching round ${roundId} for ${token}:`, error);
      return null;
    }
  }
}