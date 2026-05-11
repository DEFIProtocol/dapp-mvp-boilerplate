import express from "express";
import { Pool } from "pg";
import cors from "cors";
import dotenv from "dotenv";
import path from "path"; // Add this import
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
import { adminMarketsRouter } from "./routes/SmartContracts/adminMarkets";
import { bigintSerializer } from './middleware/bigintSerializer';
import { ensureCoreTables, ensureDatabaseExists } from "./postgres/initDb";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Enable CORS
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());

// Add BigInt serializer middleware
app.use(bigintSerializer);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, './public')));

// Database connection
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

void (async () => {
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
app.use("/api/binance", binancePricingRouter);
app.use("/api/coinbase", coinbasePricingRouter);
app.use("/api/coinranking", coinRankingRouter);
app.use("/api/1inch", oneInchRouter);
app.use("/api", pricesRouter);
app.use('/api/klines', klineRoutes);
app.use("/api/oracle", oracleRouter);
app.use("/api/pyth", pythRouter); // Add Pyth routes
app.use("/api/aggregator", priceAggregatorRouter); // Validated index+mark prices
app.use("/api/coinbase-onramp", fiatOnRampRouter);
app.use("/api/transfers", transfersRouter);
app.use("/api/paper-trading", paperTradingRouter(pool));
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

// Update console logs
app.listen(port, () => {
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
});