import express from "express";
import { Pool } from "pg";
import cors from "cors";
import dotenv from "dotenv";
import path from "path"; // Add this import
import infuraRouter from "./routes/infura";
import usersRouter from "./routes/users";
import tokensRouter from "./routes/tokens";
import coinbasePricingRouter from "./routes/coinbasePricing";
import binancePricingRouter from "./routes/binancePricing";
import coinRankingRouter from "./routes/coinRanking";
import oneInchRouter from "./routes/oneInchTokens";
import pricesRouter from "./routes/prices";
import klineRoutes from "./routes/klineRoutes";
import oracleRouter from "./routes/oracle";
import pythRouter from "./routes/pyth"; // Import Pyth router
import perpsRouter from "./routes/perps"; // Your routes
//import smartContractsRouter from "./routes/smartContracts";
import contractSimulationRouter from "./routes/contractSim/simulation";
import * as perpsHelpers from "./postgres/perps"; // Import your helpers (adjust path if needed)
import { bigintSerializer } from './middleware/bigintSerializer';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
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

pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully at:', res.rows[0].now);
    
    // Create perps table on startup
    try {
      await perpsHelpers.ensurePerpsTokensTable(pool);
      console.log('✅ Perps tokens table ready');
    } catch (error) {
      console.error('❌ Failed to create perps table:', error);
    }
  }
});

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
//app.use("/api/smart-contracts", smartContractsRouter(pool));
app.use("/api/contract-sim", contractSimulationRouter());

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