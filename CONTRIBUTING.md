# Contributing to Iron Relay

Thank you for your interest in contributing to Iron Relay! This guide will help you get started in just a few minutes.

## 🚀 Quick Start (2 Minutes)

### Prerequisites
- Node.js 18+ and npm
- Git

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/DEFIProtocol/dapp-mvp-boilerplate.git
   cd dapp-mvp-boilerplate
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

3. **Get your Iron Relay API key**
   - Visit: https://dapp-mvp-boilerplate.onrender.com/developer
   - Connect your wallet
   - Request a SANDBOX tier API key (it's free!)
   - Copy the API key

4. **Add the API key to your `.env` file**
   ```bash
   # Open .env and add your key:
   IRON_RELAY_API_KEY=your_api_key_here
   ```

5. **Install dependencies and run**
   ```bash
   npm install
   npm run dev
   ```

6. **Open your browser**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001
   - API Status: http://localhost:3001/api/dev/status

**That's it!** 🎉 You now have a fully functional development environment with real market data.

## 📊 What You Get

With the Iron Relay API key, your local development server automatically gets:

- ✅ **Real-time pricing data** from Binance, Coinbase, and more
- ✅ **Historical candlestick data** for charts
- ✅ **Oracle price feeds** for smart contracts
- ✅ **Token information** from multiple sources
- ✅ **SQLite database** (auto-created, no setup needed)
- ✅ **All trading features** working out of the box

## 🔧 How It Works

Your local server runs in **PROXY MODE**:

```
Your Local Server → Iron Relay Production API → External APIs
                    (using your API key)
```

This means:
- You don't need Binance, Coinbase, or other API keys
- You get real, live market data
- Your local changes are immediately testable
- No complex API setup required

## 📁 Project Structure

```
dapp-mvp-boilerplate/
├── apps/
│   ├── backend/          # Express API server
│   │   ├── config/       # Environment configuration
│   │   ├── middleware/   # API proxy & auth
│   │   ├── routes/       # API endpoints
│   │   └── pricing/      # Price data services
│   ├── web/              # Next.js frontend
│   └── contracts/        # Smart contracts
├── packages/             # Shared packages
├── .env.example          # Environment template
└── CONTRIBUTING.md       # This file
```

## 🛠️ Development Workflow

### Making Changes

1. **Create a new branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Edit files in `apps/web/` for frontend changes
   - Edit files in `apps/backend/` for backend changes
   - The server auto-reloads on changes

3. **Test your changes**
   ```bash
   # Backend tests
   cd apps/backend
   npm test

   # Frontend tests
   cd apps/web
   npm test
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Convention

We use conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## 🐛 Debugging

### Check Server Status

Visit http://localhost:3001/api/dev/status to see:
- Current operating mode (should be "proxy")
- Database type (should be "sqlite")
- API key configuration
- Available services

### Common Issues

**Issue: "Unauthorized" errors**
- Check that your `IRON_RELAY_API_KEY` is set in `.env`
- Verify the key is valid at the developer portal
- Make sure you copied the entire key (they're long!)

**Issue: Database errors**
- Delete `dev.db` and restart the server
- The database will be recreated automatically

**Issue: Port already in use**
- Change the port in `.env`: `PORT=3002`
- Or kill the process using the port

**Issue: No pricing data**
- Check http://localhost:3001/api/dev/status
- Verify your API key is active
- Check the console for error messages

## 📚 Additional Resources

- **API Documentation**: See `DEVELOPER_API_README.md`
- **Development Guide**: See `docs/DEVELOPMENT.md` (coming soon)
- **Production Deployment**: See `docs/PRODUCTION.md` (coming soon)

## 🤝 Getting Help

- **Discord**: [Join our community](#) (link coming soon)
- **Issues**: [GitHub Issues](https://github.com/DEFIProtocol/dapp-mvp-boilerplate/issues)
- **Email**: support@ironrelay.org

## 📝 Code Style

We use:
- **TypeScript** for type safety
- **ESLint** for linting
- **Prettier** for formatting

Run before committing:
```bash
npm run lint
npm run format
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 🎯 Good First Issues

Look for issues labeled `good first issue` in our GitHub repository. These are great starting points for new contributors!

## 📜 License

By contributing, you agree that your contributions will be licensed under the same license as the project.

## 🙏 Thank You!

Every contribution, no matter how small, helps make Iron Relay better. We appreciate your time and effort!

---

**Questions?** Don't hesitate to ask in GitHub Issues or Discord. We're here to help! 🚀
