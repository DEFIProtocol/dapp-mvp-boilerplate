/**
 * Configuration loader for DCSN node
 * Reads environment variables and validates required configs
 */

import { config as dotenvConfig } from 'dotenv';
import type { NodeConfig } from './types.js';

// Load .env if it exists
dotenvConfig();

function getEnvVar(key: string, required = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

export function loadConfig(): NodeConfig {
  return {
    port: parseInt(getEnvVar('NODE_PORT', false) || '3001', 10),
    environment: (getEnvVar('NODE_ENV', false) || 'development') as any,
    logLevel: (getEnvVar('LOG_LEVEL', false) || 'info') as any,
    baseSepoliaRpcUrl: getEnvVar('BASE_SEPOLIA_RPC_URL'),
    databaseUrl: getEnvVar('DATABASE_URL'),
    jwtSecret: getEnvVar('JWT_SECRET'),
    nodePrivateKey: getEnvVar('NODE_PRIVATE_KEY'),
    contractAddresses: {
      perpsRouter: getEnvVar('PERPS_ROUTER_ADDRESS', false) || '0x0000000000000000000000000000000000000000',
      optionsRouter: getEnvVar('OPTIONS_ROUTER_ADDRESS', false) || '0x0000000000000000000000000000000000000000',
      settlement: getEnvVar('SETTLEMENT_ADDRESS', false) || '0x0000000000000000000000000000000000000000',
      collateralManager: getEnvVar('COLLATERAL_MANAGER_ADDRESS', false) || '0x0000000000000000000000000000000000000000',
    },
    governance: {
      daoAddress: getEnvVar('DAO_ADDRESS', false) || '0x0000000000000000000000000000000000000000',
      emergencyMultisigAddress: getEnvVar('EMERGENCY_MULTISIG_ADDRESS', false) || '0x0000000000000000000000000000000000000000',
    },
  };
}

let cachedConfig: NodeConfig | null = null;

export function getConfig(): NodeConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}
