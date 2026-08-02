import express from "express";
import { Pool } from "pg";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

// IMPORTANT: Load .env BEFORE importing environment config
// This ensures process.env is populated when environment.ts reads it
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { connectRedis } from "./redis";
import { ENV, logConfiguration, getServerMode, getDatabaseType } from "./config/environment";
import infuraRouter from "./routes/infura";
import usersRouter from "./routes/database/users";
import tokensRouter from "./routes/database/tokens";
import coinbasePricingRouter from "./routes/pricing/coinbasePricing";
import binancePricingRouter from "./routes/pricing/binancePricing";
import coinRankingRouter from "./routes/pricing/coinRanking";
import oneInchRouter from "./routes/oneInchTokens";
import pricesRouter from "./routes/pricing/prices";
import klineRoutes from "./routes/pricing/klineRoutes";
import oracleRouter from "./routes/pricing/oracle";
import pythRouter from "./routes/pricing/pyth"; // Import Pyth router
import priceAggregatorRouter from "./routes/pricing/priceAggregator";
import perpsRouter from "./routes/database/perps"; // Your routes
import fiatOnRampRouter from "./routes/fiatOnRamp";
import transfersRouter from "./routes/transfers";
import smartContractsRouter from "./routes/SmartContracts/smartContracts";
import contractSimulationRouter from "./routes/contractSim/simulation";
import paperTradingRouter from "./routes/paperTrading";
import onboardingRouter from "./routes/onboarding";
import apiKeysRouter from "./routes/apiKeys";
import developerApiKeysRouter from "./routes/developerApiKeys";
import adminApiKeysRouter from "./routes/adminApiKeys";
import apiKeyAuth from "./middleware/apiKeyAuth";
import { adminMarketsRouter } from "./routes/SmartContracts/adminMarkets";
import { bigintSerializer } from './middleware/bigintSerializer';
import { ensureCoreTables, ensureDatabaseExists } from "./postgres/initDb";
import { initializeOracleKeeper, getOracleKeeper } from "./services/oracleKeeperService";
import { initializeMatchingEngine, getMatchingEngine } from "./services/orderMatchingService";

const app = express();
const port = process.env.PORT || 3001;
const allowedOrigins = (process.env.CORS_ORIGINS || 
  "http://localhost:3000,http://localhost:3001,https://dapp-mvp-boilerplate.onrender.com,https://gridiron-orxe.onrender.com,https://ironrelay.org,https://www.ironrelay.org"
)

  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
};

// Enable CORS for browser calls from approved origins
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json());

// Add BigInt serializer middleware
app.use(bigintSerializer);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, './public')));

// Database connection - use ENV.DATABASE_URL which has a default fallback
if (!ENV.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
});

void (async () => {
  try {
    await connectRedis();
  } catch (error) {
    console.warn('⚠️ Redis connection failed:', error);
  }

  try {
    await ensureDatabaseExists(process.env.DATABASE_URL!);
  } catch (error) {
    console.warn('⚠️ Could not auto-create database (it may already exist):', error);
  }

  pool.query('SELECT NOW()', async (err, res) => {
    if (err) {
      console.error('❌ Database connection failed:', err.message);
      return;
    }

    console.log('✅ Database connected successfully at:', res.rows[0].now);

    try {
      await ensureCoreTables(pool);
      console.log('✅ Core tables ready (users, tokens, perps, spot, options)');
      
      // Initialize Oracle Keeper Service (updates prices every 30 seconds)
      try {
        initializeOracleKeeper(pool, 30);
        console.log('🔮 Oracle Keeper Service started (30s interval)');
      } catch (keeperError) {
        console.warn('⚠️ Oracle Keeper failed to start:', keeperError);
      }

      // Initialize Order Matching Engine (matches orders every 10 seconds)
      try {
        initializeMatchingEngine(pool, 10);
        console.log('⚡ Order Matching Engine started (10s interval)');
      } catch (matchingError) {
        console.warn('⚠️ Order Matching Engine failed to start:', matchingError);
      }
    } catch (error) {
      console.error('❌ Failed to initialize core tables:', error);
    }
  });
})();

// API Routes (all after middleware)
app.use("/api/perps", perpsRouter(pool));
app.use("/api/infura", infuraRouter(pool));
app.use("/api/users", usersRouter(pool));
app.use("/api/tokens", tokensRouter(pool));
app.use("/api/binance", apiKeyAuth(pool, { optional: true }), binancePricingRouter);
app.use("/api/coinbase", apiKeyAuth(pool, { optional: true }), coinbasePricingRouter);
app.use("/api/coinranking", apiKeyAuth(pool, { optional: true }), coinRankingRouter);
app.use("/api/1inch", apiKeyAuth(pool, { optional: true }), oneInchRouter);
app.use("/api", pricesRouter);
app.use('/api/klines', apiKeyAuth(pool, { optional: true }), klineRoutes);
app.use("/api/oracle", apiKeyAuth(pool, { optional: true }), oracleRouter);
app.use("/api/pyth", apiKeyAuth(pool, { optional: true }), pythRouter); // Add Pyth routes
app.use("/api/aggregator", apiKeyAuth(pool, { optional: true }), priceAggregatorRouter); // Validated index+mark prices
app.use("/api/coinbase-onramp", fiatOnRampRouter);
app.use("/api/transfers", transfersRouter);
app.use("/api/paper-trading", paperTradingRouter(pool));
app.use("/api/onboarding", onboardingRouter(pool));
app.use("/api/api-keys", apiKeysRouter(pool));
app.use("/api/developer/api-keys", developerApiKeysRouter(pool));
app.use("/api/admin/api-keys", adminApiKeysRouter(pool));
app.use("/api/smart-contracts", smartContractsRouter(pool));
app.use("/api/contract-sim", contractSimulationRouter());
app.use("/api/admin/markets", adminMarketsRouter(pool));

// Health check
app.get("/health", (_req, res) => {
  res.json({ 
    status: "OK", 
    database: "connected",
    timestamp: new Date().toISOString()
  });
});

// Root endpoint - serve the dashboard HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, './public/dashboard.html'));
});

// Also keep /dashboard for backward compatibility
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, './public/dashboard.html'));
});

// Development status endpoint
app.get("/api/dev/status", (_req, res) => {
  const mode = getServerMode();
  const dbType = getDatabaseType();
  
  res.json({
    success: true,
    environment: ENV.NODE_ENV,
    mode: mode,
    database: dbType,
    configuration: {
      hasIronRelayApiKey: !!ENV.IRON_RELAY_API_KEY,
      hasBinanceApiKey: !!ENV.BINANCE_API_KEY,
      hasCoinbaseApiKey: !!ENV.COINBASE_API_KEY,
      hasRapidApiKey: !!ENV.RAPID_API_KEY,
      hasOneInchApiKey: !!ENV.ONEINCH_API_KEY,
      productionApiUrl: ENV.PRODUCTION_API_URL,
    },
    message: mode === 'proxy' 
      ? 'Using Iron Relay API for pricing data'
      : mode === 'production'
      ? 'Using direct API connections'
      : 'No API keys configured',
  });
});

// Update console logs
app.listen(port, () => {
  logConfiguration();
  
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}/`);
  console.log(`💰 Binance prices: http://localhost:${port}/api/binance/prices`);
  console.log(`💰 Coinbase prices: http://localhost:${port}/api/coinbase/prices`);
  console.log(`📈 Coinranking: http://localhost:${port}/api/coinranking/coins?limit=10`);
  console.log(`🔄 1inch tokens: http://localhost:${port}/api/1inch/tokens?chainId=1`);
  console.log(`📊 Unified prices: http://localhost:${port}/api/prices`);
  console.log(`🔮 Oracle priority: http://localhost:${port}/api/oracle/priority`);
  console.log(`🌀 Pyth Oracle: http://localhost:${port}/api/pyth/health`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
  console.log(`🔧 Dev status: http://localhost:${port}/api/dev/status`);
});
