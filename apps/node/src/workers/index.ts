/**
 * Workers module: background daemon jobs
 */

import { getLogger } from '@/observability/logger.js';
import { identityManager } from '@/identity/identityManager.js';
import { routingEngine } from '@/routing/engine.js';
import { settlementService } from '@/settlement/service.js';

const logger = getLogger();

export function startWorkers(): void {
  logger.info('Starting background workers');

  // Worker 1: Batch settlement (every 30 seconds)
  setInterval(async () => {
    try {
      routingEngine.processExpiry();
      const ids = routingEngine.flushAccepted();
      if (ids.length > 0) {
        await settlementService.batchSettle(ids);
      }
    } catch (err) {
      logger.error({ err }, 'Batch settlement worker error');
    }
  }, 30 * 1000);

  // Worker 2: Governance checks (every minute)
  setInterval(() => {
    try {
      const govState = identityManager.getGovernanceState();
      if (govState.emergencyModeActive && govState.emergencyModeActivatedAt) {
        const elapsed = Date.now() - govState.emergencyModeActivatedAt;
        if (elapsed > govState.emergencyModeDuration) {
          identityManager.deactivateEmergencyMode();
          logger.info('Emergency mode auto-expired');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Governance worker error');
    }
  }, 60 * 1000);
}
