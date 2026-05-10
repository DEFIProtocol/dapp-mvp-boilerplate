# DCSN Node Daemon

Headless TypeScript service for DCSN routing, settlement verification, and governance enforcement.

## Quick Start

```bash
# Install dependencies
npm install

# Development (with hot-reload)
npm run dev

# Production
npm run build
npm start
```

## Architecture

```
src/
├── core/           # Types, config, constants
├── api/            # Express routes and HTTP layer
├── routing/        # Order matching and routing logic
├── settlement/     # Contract calls and settlement execution
├── verification/   # Proof validation and verification
├── identity/       # Role enforcement and governance
├── security/       # Auth, rate limiting, replay protection
├── observability/  # Logging and metrics
└── workers/        # Background jobs and daemon processes
```

## Environment Setup

Copy `.env.example` to `.env` and fill in:
- `BASE_SEPOLIA_RPC_URL`: RPC endpoint
- `DATABASE_URL`: PostgreSQL connection string
- `NODE_PRIVATE_KEY`: Signer private key (hex)
- Contract addresses (from deployment)
- Governance addresses (DAO, multisig)

## Features

### Governance Integration
- Role-based access control (farmer, processor, transporter, auditor, broker, developer)
- Emergency mode enforcement (14-day limit)
- Role revocation for fraud/failures
- Audit logging of all decisions

### Routing Engine
- Paper trading (Base Sepolia only)
- Order intent queuing and matching
- Multi-leg settlement coordination

### Settlement & Verification
- On-chain proof validation
- Escrow and collateral management
- Gas-efficient batch settlement

### Security
- JWT-based authentication
- Rate limiting per role
- Replay attack protection
- Message signing with EIP-191

## Health Checks

```bash
# Server health
curl http://localhost:3001/api/health

# Ready check (for orchestration)
curl http://localhost:3001/api/ready

# Config (admin only)
curl http://localhost:3001/api/config
```

## Development Notes

- Pure TypeScript, no Docker required
- Modular architecture for future repo extraction
- All dependencies in root monorepo turbo.json
- Uses ethers.js v6 for blockchain interaction
- Pino logger with pretty-printing in dev mode

## Future Phases

1. Routing engine MVP (orderbook subscription, load balancing)
2. Settlement service (wallet abstraction, batch calls)
3. Verification module (Merkle/signature/attestation proofs)
4. Hardening (replay protection, persistence, audit trails)
5. Distribution (npm package, GitHub actions, production checklist)
