/**
 * Identity module: role enforcement and governance checks
 */

import { getLogger } from '@/observability/logger.js';
import { GOVERNANCE, PERMISSIONS } from '@/core/constants.js';
import type { NodeRole, GovernanceState } from '@/core/types.js';

export class IdentityManager {
  private roles: Map<string, NodeRole> = new Map();
  private governanceState: GovernanceState = {
    emergencyModeActive: false,
    emergencyModeDuration: 14 * 24 * 60 * 60 * 1000,
    roleRevocations: new Map(),
    auditLog: [],
  };

  private logger = getLogger();

  /**
   * Register or update a role for a principal
   */
  public setRole(principal: string, role: NodeRole): void {
    this.roles.set(principal, role);
    this.logger.info({ principal, role }, 'Role set');
  }

  /**
   * Revoke a role for a principal
   */
  public revokeRole(principal: string, reason: string): void {
    const role = this.roles.get(principal);
    if (role) {
      role.revokedAt = Date.now();
      role.revokedReason = reason;
      this.governanceState.roleRevocations.set(principal, role);
      this.logger.warn({ principal, reason }, 'Role revoked');
    }
  }

  /**
   * Check if principal has permission for action
   */
  public hasPermission(principal: string, action: string): boolean {
    const role = this.roles.get(principal);
    if (!role || role.revokedAt) {
      return false;
    }

    if (this.governanceState.emergencyModeActive) {
      // Only developers have full permissions in emergency mode
      return role.role === GOVERNANCE.ROLE_DEVELOPER;
    }

    const rolePerms = PERMISSIONS[role.role as keyof typeof PERMISSIONS];
    if (!rolePerms) return false;

    // Check if has wildcard or specific permission
    for (const perm of rolePerms) {
      if (perm === '*' || perm === action) {
        return true;
      }
    }
    return false;
  }

  /**
   * Activate emergency governance mode
   */
  public activateEmergencyMode(): void {
    this.governanceState.emergencyModeActive = true;
    this.governanceState.emergencyModeActivatedAt = Date.now();
    this.logger.error('EMERGENCY MODE ACTIVATED');
  }

  /**
   * Deactivate emergency mode (if not expired)
   */
  public deactivateEmergencyMode(): void {
    if (this.governanceState.emergencyModeActivatedAt) {
      const elapsed = Date.now() - this.governanceState.emergencyModeActivatedAt;
      if (elapsed < this.governanceState.emergencyModeDuration) {
        this.governanceState.emergencyModeActive = false;
        this.logger.info('Emergency mode deactivated');
      }
    }
  }

  /**
   * Check if emergency mode is still active
   */
  public isEmergencyModeActive(): boolean {
    if (!this.governanceState.emergencyModeActive) {
      return false;
    }

    const activatedAt = this.governanceState.emergencyModeActivatedAt || 0;
    const elapsed = Date.now() - activatedAt;
    if (elapsed > this.governanceState.emergencyModeDuration) {
      this.governanceState.emergencyModeActive = false;
      return false;
    }

    return true;
  }

  /**
   * Get governance state for diagnostics
   */
  public getGovernanceState(): GovernanceState {
    return this.governanceState;
  }
}

export const identityManager = new IdentityManager();
