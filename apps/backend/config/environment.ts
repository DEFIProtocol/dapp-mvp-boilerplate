/**
 * Environment Configuration
 * Centralizes environment variable handling and mode detection
 */

export const ENV = {
  // Environment mode
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',

  // Database configuration
  DATABASE_URL: process.env.DATABASE_URL || 'sqlite:./dev.db',
  
  // API Keys - External services (for production)
  BINANCE_API_KEY: process.env.BINANCE_API_KEY || '',
  COINBASE_API_KEY: process.env.COINBASE_API_KEY || '',
  RAPID_API_KEY: process.env.RAPID_API_KEY || '',
  ONEINCH_API_KEY: process.env.ONEINCH_API_KEY || '',
  
  // Iron Relay API Key (for development proxy mode)
  IRON_RELAY_API_KEY: process.env.IRON_RELAY_API_KEY || '',
  PRODUCTION_API_URL: process.env.PRODUCTION_API_URL || 'https://dapp-mvp-boilerplate.onrender.com',
  
  // Admin configuration
  ADMIN_WALLET_ADDRESS: process.env.ADMIN_WALLET_ADDRESS || '',
  
  // Server configuration
  PORT: process.env.PORT || 3001,
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001',
};

/**
 * Determine which mode the server should run in
 */
export function getServerMode(): 'production' | 'proxy' | 'mock' {
  // Production mode: Has external API keys
  if (ENV.BINANCE_API_KEY && ENV.COINBASE_API_KEY) {
    return 'production';
  }
  
  // Proxy mode: Has Iron Relay API key
  if (ENV.IRON_RELAY_API_KEY) {
    return 'proxy';
  }
  
  // Mock mode: No API keys available
  return 'mock';
}

/**
 * Check if using SQLite database
 */
export function isSQLite(): boolean {
  return ENV.DATABASE_URL.startsWith('sqlite:');
}

/**
 * Get database type
 */
export function getDatabaseType(): 'sqlite' | 'postgresql' {
  return isSQLite() ? 'sqlite' : 'postgresql';
}

/**
 * Log current configuration on startup
 */
export function logConfiguration(): void {
  const mode = getServerMode();
  const dbType = getDatabaseType();
  
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SERVER CONFIGURATION');
  console.log('='.repeat(60));
  console.log(`📍 Environment: ${ENV.NODE_ENV}`);
  console.log(`🔧 Server Mode: ${mode.toUpperCase()}`);
  console.log(`🗄️  Database: ${dbType.toUpperCase()}`);
  
  if (mode === 'proxy') {
    console.log(`🔗 Proxying to: ${ENV.PRODUCTION_API_URL}`);
    console.log(`🔑 Using Iron Relay API Key: ${ENV.IRON_RELAY_API_KEY.substring(0, 20)}...`);
  } else if (mode === 'production') {
    console.log(`✅ Using direct API keys (Binance, Coinbase, etc.)`);
  } else {
    console.log(`⚠️  Mock mode: No API keys configured`);
    console.log(`💡 Tip: Add IRON_RELAY_API_KEY to .env for real data`);
  }
  
  console.log('='.repeat(60) + '\n');
}
