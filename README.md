# Iron Relay - DeFi Trading Platform

A full-stack decentralized trading platform with perpetual futures, spot trading, and options. Built with Next.js, Express, and Solidity smart contracts.

## 🚀 Quick Start for Contributors

Want to contribute? Get started in just 2 minutes!

```bash
# 1. Clone the repo
git clone https://github.com/DEFIProtocol/dapp-mvp-boilerplate.git
cd dapp-mvp-boilerplate

# 2. Set up environment
cp .env.example .env

# 3. Get your free API key from:
# https://dapp-mvp-boilerplate.onrender.com/developer
# Add it to .env as IRON_RELAY_API_KEY

# 4. Install and run
npm install
npm run dev
```

**That's it!** Your local server will have real market data without needing any external API keys.

👉 **See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed setup instructions**

## ✨ Features

### Trading
- 🔮 **Perpetual Futures** - Leveraged trading with funding rates
- 💱 **Spot Trading** - Direct token swaps
- 📊 **Options Trading** - Call and put options
- 📈 **Real-time Charts** - TradingView integration
- 💰 **Paper Trading** - Practice with virtual funds

### Data & APIs
- 🔗 **Multi-source Pricing** - Binance, Coinbase, Pyth, and more
- 🎯 **Oracle System** - Reliable price feeds for smart contracts
- 🔑 **Developer API** - Tiered API access (Sandbox, Production, Enterprise)
- 📡 **WebSocket Feeds** - Real-time price updates

### Infrastructure
- ⚡ **Smart Contracts** - Audited Solidity contracts on Base
- 🗄️ **PostgreSQL/SQLite** - Flexible database support
- 🔐 **Wallet Authentication** - Secure signature-based auth
- 🎨 **Modern UI** - Responsive design with dark/light modes

## 📁 Project Structure

```
dapp-mvp-boilerplate/
├── apps/
│   ├── backend/          # Express API server
│   │   ├── config/       # Environment & configuration
│   │   ├── middleware/   # Auth, proxy, rate limiting
│   │   ├── routes/       # API endpoints
│   │   ├── pricing/      # Price aggregation services
│   │   └── postgres/     # Database models
│   ├── web/              # Next.js frontend
│   │   ├── app/          # App router pages
│   │   ├── components/   # React components
│   │   └── contexts/     # React contexts
│   └── contracts/        # Solidity smart contracts
├── packages/             # Shared packages
│   ├── trading-api/      # API client
│   ├── trading-hooks/    # React hooks
│   └── trading-types/    # TypeScript types
└── docs/                 # Documentation
```

## 🛠️ Development

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Environment Setup

The project supports three operating modes:

#### 1. **Proxy Mode** (Recommended for Contributors)
Use our production API for all pricing data:
```bash
NODE_ENV=development
DATABASE_URL=sqlite:./dev.db
IRON_RELAY_API_KEY=your_api_key_here
```

#### 2. **Production Mode** (For Deployment)
Use your own external API keys:
```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
BINANCE_API_KEY=your_key
COINBASE_API_KEY=your_key
# ... other API keys
```

#### 3. **Mock Mode** (Fallback)
No API keys needed, uses cached data:
```bash
NODE_ENV=development
DATABASE_URL=sqlite:./dev.db
# No API keys
```

### Running the Project

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start
```

### Available Scripts

- `npm run dev` - Start development servers (frontend + backend)
- `npm run build` - Build all packages
- `npm test` - Run all tests
- `npm run lint` - Lint code
- `npm run format` - Format code with Prettier

## 🔑 API Access

### For Contributors
Get a free SANDBOX API key to access real market data while developing:
1. Visit https://dapp-mvp-boilerplate.onrender.com/developer
2. Connect your wallet
3. Request a SANDBOX tier key
4. Add to your `.env` file

### For External Developers
Use our API in your own projects:
- **SANDBOX**: Free, 60 req/min, testnet data
- **PRODUCTION LITE**: $25 deposit, 120 req/min, mainnet data
- **ENTERPRISE**: $100 deposit + KYC, 1000+ req/min, webhooks

See [DEVELOPER_API_README.md](./DEVELOPER_API_README.md) for full API documentation.

## 📚 Documentation

- [Contributing Guide](./CONTRIBUTING.md) - How to contribute
- [API Documentation](./DEVELOPER_API_README.md) - API reference
- [KYC & Security](./KYC_COMPETENCY_SECURITY.md) - Security practices

## 🧪 Testing

```bash
# Run all tests
npm test

# Run backend tests
cd apps/backend && npm test

# Run frontend tests
cd apps/web && npm test

# Run with coverage
npm run test:coverage
```

## 🚢 Deployment

### Backend (Render/Railway/Heroku)
```bash
# Set environment variables
NODE_ENV=production
DATABASE_URL=postgresql://...
BINANCE_API_KEY=...
COINBASE_API_KEY=...
# ... other production keys

# Deploy
git push production main
```

### Frontend (Vercel/Netlify)
```bash
# Set environment variables
NEXT_PUBLIC_API_URL=https://your-api.com

# Deploy
vercel deploy --prod
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Quick start guide
- Development workflow
- Code style guidelines
- Testing requirements
- Pull request process

## 📄 License

[Add your license here]

## 🙏 Acknowledgments

Built with:
- [Next.js](https://nextjs.org/) - React framework
- [Express](https://expressjs.com/) - Backend framework
- [Hardhat](https://hardhat.org/) - Smart contract development
- [TradingView](https://www.tradingview.com/) - Charting library
- [Wagmi](https://wagmi.sh/) - Ethereum React hooks

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/DEFIProtocol/dapp-mvp-boilerplate/issues)
- **Email**: support@ironrelay.org
- **Discord**: [Join our community](#) (coming soon)

## 🗺️ Roadmap

- [ ] Mobile app (React Native)
- [ ] Advanced order types (stop-loss, take-profit)
- [ ] Social trading features
- [ ] Multi-chain support
- [ ] Governance token

---

**Made with ❤️ by the Iron Relay team**
