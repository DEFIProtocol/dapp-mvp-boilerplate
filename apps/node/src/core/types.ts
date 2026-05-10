/**
 * Core type definitions for DCSN node
 */

export interface NodeConfig {
  port: number;
  environment: 'development' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  baseSepoliaRpcUrl: string;
  databaseUrl: string;
  jwtSecret: string;
  nodePrivateKey: string;
  contractAddresses: {
    perpsRouter: string;
    optionsRouter: string;
    settlement: string;
    collateralManager: string;
  };
  governance: {
    daoAddress: string;
    emergencyMultisigAddress: string;
  };
}

export interface NodeRole {
  role: 'farmer' | 'processor' | 'transporter' | 'auditor' | 'broker' | 'developer';
  permissions: string[];
  revokedAt?: number;
  revokedReason?: string;
}

export interface GovernanceState {
  emergencyModeActive: boolean;
  emergencyModeActivatedAt?: number;
  emergencyModeDuration: number; // 14 days in ms
  roleRevocations: Map<string, NodeRole>;
  auditLog: AuditEntry[];
}

export interface AuditEntry {
  timestamp: number;
  actor: string;
  action: string;
  resource: string;
  status: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}

export interface RoutingIntent {
  id: string;
  creator: string;
  instrument: 'perps' | 'options';
  orderType: 'limit' | 'market';
  side: 'long' | 'short' | 'buy' | 'sell';
  size: bigint;
  collateral: bigint;
  price?: bigint;
  chainId: number;
  expiresAt: number;
  createdAt: number;
  status: 'pending' | 'accepted' | 'rejected' | 'settled';
  settledAt?: number;
}

export interface SettlementProof {
  intentId: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  gasUsed: bigint;
  status: 'confirmed' | 'pending' | 'failed';
}

export interface VerificationPayload {
  proofType: 'merkle' | 'signature' | 'attestation';
  data: string;
  signer?: string;
  timestamp: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: boolean;
    contracts: boolean;
    governance: boolean;
    routing: boolean;
    peers?: boolean;
  };
  uptime: number;
  lastCheck: number;
}
