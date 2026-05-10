/**
 * Global constants for DCSN node
 */

export const PAPER_TRADING_CHAIN_ID = 84532; // Base Sepolia

export const GOVERNANCE = {
  EMERGENCY_MODE_DURATION_MS: 14 * 24 * 60 * 60 * 1000, // 14 days
  ROLE_PROCESSOR: 'processor',
  ROLE_FARMER: 'farmer',
  ROLE_TRANSPORTER: 'transporter',
  ROLE_AUDITOR: 'auditor',
  ROLE_BROKER: 'broker',
  ROLE_DEVELOPER: 'developer',
} as const;

export const PERMISSIONS = {
  [GOVERNANCE.ROLE_PROCESSOR]: [
    'route:accept',
    'route:reject',
    'settlement:execute',
    'verification:validate',
  ],
  [GOVERNANCE.ROLE_FARMER]: [
    'order:create',
    'position:query',
    'collateral:check',
  ],
  [GOVERNANCE.ROLE_TRANSPORTER]: [
    'route:forward',
    'settlement:relay',
    'proof:submit',
  ],
  [GOVERNANCE.ROLE_AUDITOR]: [
    'audit:read',
    'governance:query',
    'log:read',
  ],
  [GOVERNANCE.ROLE_BROKER]: [
    'route:price',
    'route:aggregate',
    'liquidity:query',
  ],
  [GOVERNANCE.ROLE_DEVELOPER]: [
    '*', // all permissions during development
  ],
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const ERROR_CODES = {
  INVALID_CHAIN: 'ERR_INVALID_CHAIN',
  UNAUTHORIZED_ROLE: 'ERR_UNAUTHORIZED_ROLE',
  GOVERNANCE_BLOCKED: 'ERR_GOVERNANCE_BLOCKED',
  SETTLEMENT_FAILED: 'ERR_SETTLEMENT_FAILED',
  VERIFICATION_FAILED: 'ERR_VERIFICATION_FAILED',
  DATABASE_ERROR: 'ERR_DATABASE',
  INVALID_PROOF: 'ERR_INVALID_PROOF',
} as const;
