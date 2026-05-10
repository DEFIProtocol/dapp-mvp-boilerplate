# DCSN Node Deployment Guide

## Pre-Deployment Checklist

### 1. Environment Variables
All required environment variables must be set before deployment:

```bash
# Core
NODE_PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Blockchain (Base Sepolia for paper trading, Mainnet for production)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PERPS_ROUTER_ADDRESS=0x...
OPTIONS_ROUTER_ADDRESS=0x...
SETTLEMENT_ADDRESS=0x...
COLLATERAL_MANAGER_ADDRESS=0x...

# Database
DATABASE_URL=postgresql://...

# Security
JWT_SECRET=<strong random string, min 32 chars>
NODE_PRIVATE_KEY=0x<64 hex chars>

# Governance
DAO_ADDRESS=0x...
EMERGENCY_MULTISIG_ADDRESS=0x...
```

### 2. Database Setup
- PostgreSQL 14+ required
- Migrations must be run before boot
- Connection pool: 10-50 connections (adjust based on load)

### 3. Keys & Security
- `NODE_PRIVATE_KEY`: Private key for on-chain signings (keep in secure vault)
- `JWT_SECRET`: Used for API authentication (rotate every 90 days)
- All env vars should be loaded from secure secret manager (not committed to repo)

### 4. Contract Deployment
All smart contract addresses must be deployed and verified on Base Sepolia:
- PerpRouter: Perps order execution
- OptionsRouter: Options settlement
- Settlement: Core settlement logic
- CollateralManager: Margin/collateral tracking

## Deployment Methods

### Option 1: Bare Metal / VPS (Recommended for MVP)

```bash
# On your VPS/EC2:
git clone <repo>
cd dapp-mvp-boilerplate

# Load environment
export $(cat .env.production | xargs)

# Install and build
npm install
npm run node:build

# Run with systemd (systemctl start dcsn-node)
# or direct: npm run node:start
```

### Option 2: Render / Railway (Node.js hosting)

```yaml
# railway.yaml
services:
  - name: dcsn-node
    build:
      builder: nixpacks
    start: npm run node:start
    env:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        reference: ${{ postgres.DATABASE_URL }}
      # ... other env vars
```

### Option 3: AWS Lambda (Experimental)

```bash
# Package node as zip and deploy via AWS SAM
npm run node:build
zip -r node-daemon.zip dist node_modules
aws lambda create-function --function-name dcsn-node --handler dist/index.handler --runtime nodejs20.x
```

**Note**: Not recommended for MVP—Lambda cold starts add 1-3s latency per request.

## Production Hardening

### 1. Rate Limiting
- Per-role API limits enforced in `src/security/middleware.ts`
- Configure thresholds in environment
- Example: Farmers get 100 req/min, Processors get 1000 req/min

### 2. Monitoring & Alerts
- All errors logged with pino to stdout (capture in CloudWatch/DataDog/ELK)
- Health endpoint: `GET /api/health` (add to uptime monitors)
- Ready check: `GET /api/ready` (for orchestration / load balancer warm-up)

### 3. Graceful Shutdown
- Service handles SIGTERM and SIGINT
- Ongoing settlements are batched before shutdown
- Audit logs flushed to database
- Configure shutdown timeout (30s recommended)

### 4. Backup & Recovery
- Database backups: Daily snapshots (AWS RDS automated backups)
- Config backups: Store env file in secure vault (e.g., AWS Secrets Manager)
- Disaster recovery: Document recovery procedures, test quarterly

## Scaling Strategy

### Phase 1: Single Node (MVP)
- 1 daemon on 1 VPS (t3.medium or equivalent)
- Monolithic: routing + settlement + verification on same process
- SQLite or single-node PostgreSQL

### Phase 2: Scaled Deployment
- Multiple nodes behind load balancer
- Dedicated settlement service (split from routing)
- PostgreSQL with read replicas
- Redis cache for rate limiting / nonces

### Phase 3: Distributed
- Microservices: routing-svc, settlement-svc, verification-svc (separate repos)
- Message queue (RabbitMQ/Kafka) for async settlement
- Node.js clustering or Kubernetes orchestration

## Observability Setup

### Logging
```bash
# Local development (pretty format)
NODE_ENV=development npm run node:dev

# Production (JSON format for log aggregation)
NODE_ENV=production npm run node:start | jq . | tee -a /var/log/dcsn-node.log
```

### Metrics
- Track via application logs (pino)
- Export metrics via Prometheus endpoint (future phase)
- Example: request rate, settlement latency, governance mode events

### Debugging
```bash
# Enable debug logs
LOG_LEVEL=debug npm run node:start

# Check health
curl http://localhost:3001/api/health

# View config (admin)
curl -H "Authorization: Bearer $JWT_TOKEN" http://localhost:3001/api/config
```

## Rollback Procedure

1. Stop the daemon: `systemctl stop dcsn-node`
2. Revert to previous commit: `git checkout <previous-tag>`
3. Rebuild: `npm run node:build`
4. Restart: `systemctl start dcsn-node`
5. Verify health: `curl http://localhost:3001/api/health`

If database schema changed, restore from backup before restart.

## Security Audit Checklist

- [ ] JWT secret is 32+ random characters
- [ ] Node private key is in vault (not in git or env files)
- [ ] Database password uses strong, unique secret
- [ ] Rate limits are enabled for all roles
- [ ] Replay protection middleware is active
- [ ] All contract addresses are verified on-chain
- [ ] Emergency multisig address is configured
- [ ] Audit logs are persisted to database
- [ ] HTTPS enforced (via reverse proxy, e.g., nginx)
- [ ] CORS is restricted to trusted origins

## Support & Runbook

### Service Won't Start
1. Check env vars: `printenv | grep NODE_`
2. Check logs: `journalctl -u dcsn-node -n 50`
3. Verify database connection: `psql $DATABASE_URL`
4. Verify contracts are deployed: `ethers.getCode(SETTLEMENT_ADDRESS)`

### High Error Rate
1. Check governance state: `curl /api/health`
2. If emergency mode active: `curl -X POST /governance/emergency/disable` (admin)
3. Restart node with clean state: `systemctl restart dcsn-node`

### Settlement Backlog
1. Check pending intents: `SELECT COUNT(*) FROM routing_intents WHERE status = 'pending';`
2. Manually trigger batch: `curl -X POST /settlement/batch-process` (admin)
3. Monitor gas prices, may need to increase priority

## Future Enhancements

- [ ] WebSocket subscriptions for real-time orderbook
- [ ] GraphQL API for complex queries
- [ ] Zero-knowledge proofs for privacy-preserving settlement
- [ ] Multi-chain support (Arbitrum, Optimism, Polygon)
- [ ] Horizontal scaling with shared state (Redis)
- [ ] Machine learning for order routing optimization
