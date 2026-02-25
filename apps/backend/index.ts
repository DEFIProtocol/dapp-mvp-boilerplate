import express from "express";
import { Pool } from "pg";
import infuraRouter from "./routes/infura";

const app = express();
const port = process.env.PORT || 4000;

// Parse JSON bodies
app.use(express.json());

// Set up Postgres connection pool
const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	// You can add more config here if needed
});

// Mount Infura API routes
app.use("/api", infuraRouter(pool));

// Health check route
app.get("/health", (_req, res) => res.send("OK"));

// Start server
app.listen(port, () => {
	console.log(`Backend server listening on port ${port}`);
});
