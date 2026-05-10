/**
 * Routing module: order intent queuing, acceptance, and batch flush
 */

import { randomUUID } from 'crypto';
import { getLogger } from '@/observability/logger.js';
import { PAPER_TRADING_CHAIN_ID } from '@/core/constants.js';
import type { RoutingIntent } from '@/core/types.js';

export class RoutingEngine {
  private logger = getLogger();
  private pendingIntents: Map<string, RoutingIntent> = new Map();

  /**
   * Queue a new order intent. Validates chain, expiry, and required fields.
   * Returns the assigned intent ID.
   */
  public queueIntent(
    params: Omit<RoutingIntent, 'id' | 'createdAt' | 'status'>
  ): RoutingIntent {
    if (params.chainId !== PAPER_TRADING_CHAIN_ID) {
      throw new Error(`Invalid chain. Expected ${PAPER_TRADING_CHAIN_ID}, got ${params.chainId}`);
    }
    if (params.expiresAt < Date.now()) {
      throw new Error('Intent is already expired');
    }

    const intent: RoutingIntent = {
      ...params,
      id: randomUUID(),
      createdAt: Date.now(),
      status: 'pending',
    };

    this.pendingIntents.set(intent.id, intent);
    this.logger.info({ intentId: intent.id, creator: intent.creator }, 'Intent queued');
    return intent;
  }

  /**
   * Accept a pending intent (marks it for settlement).
   */
  public acceptIntent(id: string): void {
    const intent = this.pendingIntents.get(id);
    if (!intent) throw new Error(`Intent not found: ${id}`);
    intent.status = 'accepted';
    this.logger.info({ intentId: id }, 'Intent accepted');
  }

  /**
   * Reject a pending intent.
   */
  public rejectIntent(id: string, reason: string): void {
    const intent = this.pendingIntents.get(id);
    if (!intent) throw new Error(`Intent not found: ${id}`);
    intent.status = 'rejected';
    this.pendingIntents.delete(id);
    this.logger.warn({ intentId: id, reason }, 'Intent rejected');
  }

  /**
   * Flush all accepted intents for batch settlement.
   * Returns the IDs flushed; removes them from the pending map.
   */
  public flushAccepted(): string[] {
    const ids: string[] = [];
    for (const [id, intent] of this.pendingIntents) {
      if (intent.status === 'accepted') {
        ids.push(id);
        this.pendingIntents.delete(id);
      }
    }
    if (ids.length > 0) {
      this.logger.info({ count: ids.length }, 'Flushing accepted intents for settlement');
    }
    return ids;
  }

  /**
   * Auto-accept all pending intents that have not expired.
   * Called by the batch worker before flushing.
   */
  public processExpiry(): void {
    const now = Date.now();
    for (const [id, intent] of this.pendingIntents) {
      if (intent.status === 'pending') {
        if (intent.expiresAt < now) {
          intent.status = 'rejected';
          this.pendingIntents.delete(id);
          this.logger.debug({ intentId: id }, 'Intent expired and removed');
        } else {
          intent.status = 'accepted';
        }
      }
    }
  }

  public getIntent(id: string): RoutingIntent | undefined {
    return this.pendingIntents.get(id);
  }

  public getAllIntents(): RoutingIntent[] {
    return Array.from(this.pendingIntents.values());
  }

  public isHealthy(): boolean {
    return true; // Extend with circuit-breaker logic later
  }
}

export const routingEngine = new RoutingEngine();
