import express from "express";
import { Pool } from "pg";
import cors from "cors";
import dotenv from "dotenv";
import infuraRouter from "./routes/infura";
import usersRouter from "./routes/users";
import tokensRouter from "./routes/tokens";
import coinbasePricingRouter from "./routes/coinbasePricing";
import binancePricingRouter from "./routes/binancePricing";
import coinRankingRouter from "./routes/coinRanking";
import oneInchRouter from "./routes/oneInchTokens";
import pricesRouter from "./routes/prices";


dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

app.use(express.json());

// Database connection
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully at:', res.rows[0].now);
  }
});

// API Routes
app.use("/api/infura", infuraRouter(pool));
app.use("/api/users", usersRouter(pool));
app.use("/api/tokens", tokensRouter(pool));
app.use("/api/binance", binancePricingRouter);
app.use("/api/coinbase", coinbasePricingRouter);
app.use("/api/coinranking", coinRankingRouter); // Add this
app.use("/api/1inch", oneInchRouter);
app.use("/api", pricesRouter); // Now you have /api/prices

// Health check
app.get("/health", (_req, res) => {
  res.json({ 
    status: "OK", 
    database: "connected",
    timestamp: new Date().toISOString()
  });
});

// Root endpoint - show available routes
app.get("/", (req, res) => {
  // Check if client wants HTML
  const accept = req.headers.accept || '';
  
  if (accept.includes('text/html')) {
    // HTML response for browsers
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DApp MVP API</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
            h1 { color: #333; }
            h2 { color: #666; margin-top: 30px; }
            .endpoint { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .url { color: #0066cc; font-family: monospace; font-size: 14px; }
            .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 10px; }
            .badge.binance { background: #f0b90b; color: #1e1e1e; }
            .badge.coinbase { background: #0052ff; color: white; }
            .badge.coinranking { background: #8a2be2; color: white; }
            .badge.oneinch { background: #4CAF50; color: white; }
            .badge.db { background: #28a745; color: white; }
            .method { display: inline-block; padding: 2px 6px; border-radius: 4px; background: #e9ecef; font-family: monospace; font-size: 12px; margin-right: 10px; }
            .method.get { background: #d1e7dd; color: #0f5132; }
            .method.post { background: #fff3cd; color: #856404; }
            .method.delete { background: #f8d7da; color: #721c24; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; margin-top: 20px; }
            .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .card h3 { margin-top: 0; color: #333; }
            .links { margin-top: 15px; }
            .links a { color: #0066cc; text-decoration: none; margin-right: 15px; font-size: 14px; }
            .links a:hover { text-decoration: underline; }
            .chain-selector { margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 6px; }
            .chain-selector select { padding: 8px; border-radius: 4px; border: 1px solid #ddd; margin-right: 10px; }
            .chain-selector button { padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
            .chain-selector button:hover { background: #45a049; }
            footer { margin-top: 40px; color: #666; font-size: 12px; text-align: center; }
          </style>
        </head>
        <body>
          <h1>🚀 DApp MVP API</h1>
          <p>Version 1.0.0 - Crypto pricing and blockchain data API</p>
          
          <div class="grid">
            <!-- Exchange Pricing Card -->
            <div class="card">
              <h3>💰 Exchange Pricing</h3>
              
              <div class="endpoint">
                <span class="badge binance">BINANCE</span>
                <span class="method get">GET</span><br>
                <span class="url">/api/binance/prices</span>
                <p>Real-time prices for 200+ tokens via WebSocket</p>
                <div class="links">
                  <a href="/api/binance/prices" target="_blank">View JSON</a>
                  <a href="/api/binance/health">Health</a>
                </div>
              </div>
              
              <div class="endpoint">
                <span class="badge coinbase">COINBASE</span>
                <span class="method get">GET</span><br>
                <span class="url">/api/coinbase/prices</span>
                <p>Real-time prices for all Coinbase USD pairs</p>
                <div class="links">
                  <a href="/api/coinbase/prices" target="_blank">View JSON</a>
                  <a href="/api/coinbase/health">Health</a>
                </div>
              </div>
            </div>
            
            <!-- Market Data Card -->
            <div class="card">
              <h3>📈 Market Data (CoinRanking)</h3>
              
              <div class="endpoint">
                <span class="badge coinranking">RAPIDAPI</span>
                <span class="method get">GET</span><br>
                <span class="url">/api/coinranking/coins?limit=10</span>
                <p>Get top coins with pagination</p>
                <div class="links">
                  <a href="/api/coinranking/coins?limit=10" target="_blank">View JSON</a>
                </div>
              </div>
              
              <div class="endpoint">
                <span class="badge coinranking">RAPIDAPI</span>
                <span class="method get">GET</span><br>
                <span class="url">/api/coinranking/coin/:coinId</span>
                <p>Get detailed coin info (e.g., Bitcoin: Qwsogvtv82FCd)</p>
                <div class="links">
                  <a href="/api/coinranking/coin/Qwsogvtv82FCd" target="_blank">View Bitcoin</a>
                </div>
              </div>
              
              <div class="endpoint">
                <span class="badge coinranking">RAPIDAPI</span>
                <span class="method get">GET</span><br>
                <span class="url">/api/coinranking/stats</span>
                <p>Rate limiter and cache stats</p>
                <div class="links">
                  <a href="/api/coinranking/stats" target="_blank">View Stats</a>
                </div>
              </div>
            </div>
            
            <!-- 1inch Tokens Card -->
            <div class="card">
              <h3>🔄 1inch Token Lists</h3>
              
              <div class="endpoint">
                <span class="badge oneinch">1INCH</span>
                <span class="method get">GET</span><br>
                <span class="url">/api/1inch/tokens?chainId={chainId}</span>
                <p>Get all tokens for any chain (cached for 5 minutes)</p>
                
                <div class="chain-selector">
                  <label for="chainSelect">Select Chain:</label>
                  <select id="chainSelect">
                    <option value="1">Ethereum (1)</option>
                    <option value="56">BSC (56)</option>
                    <option value="137">Polygon (137)</option>
                    <option value="10">Optimism (10)</option>
                    <option value="42161">Arbitrum (42161)</option>
                    <option value="43114">Avalanche (43114)</option>
                    <option value="250">Fantom (250)</option>
                    <option value="100">Gnosis (100)</option>
                    <option value="8453">Base (8453)</option>
                    <option value="324">zkSync (324)</option>
                  </select>
                  <button onclick="fetchOneInchTokens()">Fetch Tokens</button>
                </div>
                
                <div id="oneinchResults" style="margin-top: 10px; font-size: 12px; max-height: 200px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 4px;">
                  <p>Select a chain and click "Fetch Tokens" to see token count</p>
                </div>
                
                <div class="links" style="margin-top: 10px;">
                  <a href="/api/1inch/tokens?chainId=1" target="_blank">Ethereum Tokens</a>
                  <a href="/api/1inch/tokens?chainId=56" target="_blank">BSC Tokens</a>
                  <a href="/api/1inch/tokens?chainId=137" target="_blank">Polygon Tokens</a>
                </div>
              </div>
              
              <div class="endpoint">
                <span class="badge oneinch">1INCH</span>
                <span class="method get">GET</span><br>
                <span class="url">/api/1inch/chains</span>
                <p>List all supported chains</p>
                <div class="links">
                  <a href="/api/1inch/chains" target="_blank">View Chains</a>
                </div>
              </div>
            </div>
            
            <!-- Database & System Card -->
            <div class="card">
              <h3>🗄️ Database & System</h3>
              
              <div class="endpoint">
                <span class="badge db">DB</span>
                <span class="method get">GET</span><br>
                <span class="url">/api/infura</span>
                <p>Ethereum blockchain data</p>
              </div>
              
              <div class="endpoint">
                <span class="badge db">DB</span>
                <span class="method get">GET</span><br>
                <span class="url">/api/users</span>
                <p>User management</p>
              </div>
              
              <div class="endpoint">
                <span class="badge db">DB</span>
                <span class="method get">GET</span><br>
                <span class="url">/api/tokens</span>
                <p>Token metadata</p>
              </div>
              
              <div class="endpoint">
                <span class="method get">GET</span><br>
                <span class="url">/health</span>
                <p>System health check</p>
                <div class="links">
                  <a href="/health" target="_blank">View Health</a>
                </div>
              </div>
            </div>
          </div>
          
          <footer>
            <p>Timestamp: ${new Date().toISOString()}</p>
            <p>Server running on port ${port}</p>
          </footer>

          <script>
            async function fetchOneInchTokens() {
              const select = document.getElementById('chainSelect');
              const chainId = select.value;
              const resultsDiv = document.getElementById('oneinchResults');
              
              resultsDiv.innerHTML = '<p>Loading...</p>';
              
              try {
                const response = await fetch(\`/api/1inch/tokens?chainId=\${chainId}\`);
                const data = await response.json();
                
                if (data.success) {
                  const tokens = data.data.tokens || {};
                  const tokenCount = Object.keys(tokens).length;
                  const sampleTokens = Object.values(tokens).slice(0, 5);
                  
                  resultsDiv.innerHTML = \`
                    <p><strong>✅ Found \${tokenCount} tokens on chain \${chainId}</strong></p>
                    <p>Sample tokens:</p>
                    <ul style="margin: 5px 0; padding-left: 20px;">
                      \${sampleTokens.map((t: any) => \`<li>\${t.symbol} - \${t.name}</li>\`).join('')}
                    </ul>
                    <p style="margin-top: 5px;"><a href="/api/1inch/tokens?chainId=\${chainId}" target="_blank">View Full JSON →</a></p>
                  \`;
                } else {
                  resultsDiv.innerHTML = \`<p style="color: red;">❌ Error: \${data.error}</p>\`;
                }
              } catch (error) {
                resultsDiv.innerHTML = \`<p style="color: red;">❌ Failed to fetch: \${error.message}</p>\`;
              }
            }
            
            // Auto-fetch Ethereum tokens on page load
            window.addEventListener('load', () => {
              setTimeout(fetchOneInchTokens, 500);
            });
          </script>
        </body>
      </html>
    `);
  } else {
    // JSON response for API clients
    res.json({
      name: "DApp MVP API",
      version: "1.0.0",
      description: "Crypto pricing and blockchain data API",
      endpoints: {
        health: "/health",
        api: {
          infura: "/api/infura",
          users: "/api/users",
          tokens: "/api/tokens",
          binance: {
            prices: "/api/binance/prices",
            health: "/api/binance/health"
          },
          coinbase: {
            prices: "/api/coinbase/prices",
            health: "/api/coinbase/health"
          },
          coinranking: {
            coins: "/api/coinranking/coins",
            coin: "/api/coinranking/coin/:coinId",
            history: "/api/coinranking/coin/:coinId/history",
            stats: "/api/coinranking/stats"
          },
          oneinch: {
            tokens: "/api/1inch/tokens?chainId={chainId}",
            chains: "/api/1inch/chains"
          }
        }
      },
      quickLinks: {
        binancePrices: `http://localhost:${port}/api/binance/prices`,
        coinbasePrices: `http://localhost:${port}/api/coinbase/prices`,
        coinrankingCoins: `http://localhost:${port}/api/coinranking/coins?limit=10`,
        oneinchEthereum: `http://localhost:${port}/api/1inch/tokens?chainId=1`,
        oneinchBSC: `http://localhost:${port}/api/1inch/tokens?chainId=56`,
        health: `http://localhost:${port}/health`
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Update console logs
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📊 Root endpoint: http://localhost:${port}/`);
  console.log(`💰 Binance prices: http://localhost:${port}/api/binance/prices`);
  console.log(`💰 Coinbase prices: http://localhost:${port}/api/coinbase/prices`);
  console.log(`📈 Coinranking: http://localhost:${port}/api/coinranking/coins?limit=10`);
  console.log(`🔄 1inch tokens: http://localhost:${port}/api/1inch/tokens?chainId=1`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
});