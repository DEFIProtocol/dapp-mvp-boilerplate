/**
 * Settlement module: proof tracking and on-chain submission
 */

import { getLogger } from '@/observability/logger.js';
import { getConfig } from '@/core/config.js';
import type { SettlementProof } from '@/core/types.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export class SettlementService {
  private logger = getLogger();
  private proofs: Map<string, SettlementProof> = new Map();

  /**
   * Submit settlement for a single intent.
   * If the contract address is undeployed (0x000...) it logs a warning and skips the on-chain call,
   * allowing development to proceed without deployed contracts.
   */
  public async settle(intentId: string): Promise<SettlementProof> {
    const config = getConfig();
    const proof: SettlementProof = {
      intentId,
      txHash: '',
      blockNumber: 0,
      timestamp: Date.now(),
      gasUsed: 0n,
      status: 'pending',
    };

    if (config.contractAddresses.settlement === ZERO_ADDRESS) {
      this.logger.warn({ intentId }, 'Settlement contract not deployed — skipping on-chain call');
      proof.status = 'pending';
    } else {
      // TODO: Call Settlement contract via ethers.js
      // const provider = new ethers.JsonRpcProvider(config.baseSepoliaRpcUrl);
      // const wallet = new ethers.Wallet(config.nodePrivateKey, provider);
      // const contract = new ethers.Contract(config.contractAddresses.settlement, ABI, wallet);
      // const tx = await contract.settle(intentId);
      // const receipt = await tx.wait();
      // proof.txHash = receipt.hash;
      // proof.blockNumber = receipt.blockNumber;
      // proof.gasUsed = receipt.gasUsed;
      // proof.status = 'confirmed';
      this.logger.info({ intentId }, 'Settlement submitted');
    }

    this.proofs.set(intentId, proof);
    return proof;
  }

  /**
   * Batch settle a list of intent IDs. Returns settled proofs.
   */
  public async batchSettle(intentIds: string[]): Promise<SettlementProof[]> {
    if (intentIds.length === 0) return [];
    this.logger.info({ count: intentIds.length }, 'Batch settle started');

    const results = await Promise.allSettled(
      intentIds.map((id) => this.settle(id))
    );

    const proofs: SettlementProof[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        proofs.push(result.value);
      } else {
        this.logger.error({ reason: result.reason }, 'Single settlement failed in batch');
      }
    }

    this.logger.info({ settled: proofs.length, total: intentIds.length }, 'Batch settle complete');
    return proofs;
  }

  public getProof(intentId: string): SettlementProof | undefined {
    return this.proofs.get(intentId);
  }
}

export const settlementService = new SettlementService();
