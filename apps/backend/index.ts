import express from "express";
import { Pool } from "pg";
import cors from "cors";
import dotenv from "dotenv"; // Add this
import infuraRouter from "./routes/infura";
import usersRouter from "./routes/users";
import tokensRouter from "./routes/tokens";

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

// Parse JSON bodies
app.use(express.json());

// Set up Postgres connection pool
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully at:', res.rows[0].now);
  }
});

// Mount API routes
app.use("/api/infura", infuraRouter(pool));
app.use("/api/users", usersRouter(pool));
app.use("/api/tokens", tokensRouter(pool));

// Health check route
app.get("/health", (_req, res) => {
  res.json({ 
    status: "OK", 
    database: "connected",
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`🚀 Backend server listening on port ${port}`);
  console.log(`📝 Health check: http://localhost:${port}/health`);
});