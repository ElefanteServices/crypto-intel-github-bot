# Crypto Intel GitHub Bot

A comprehensive GitHub app that acts as a node of information, integrating multiple cryptocurrency and blockchain APIs to provide automated insights, monitoring, and analysis for your repositories.

## Features

### 🔍 **Blockchain Intelligence**
- **Gas Estimation**: Analyze transaction costs across multiple networks
- **Network Monitoring**: Track contract deployments and activity
- **Oracle Integration**: Update repositories with external blockchain data
- **DeFi Protocol Monitoring**: Track liquidity, yield changes, and protocol metrics

### 📊 **Market Data Integration**
- **CoinGecko**: Real-time crypto prices, market cap, and trending coins
- **CoinDesk**: Bitcoin price tracking and historical data
- **Arkham Intel**: Blockchain intelligence and transaction analysis

### 🤖 **GitHub Automation**
- Automated analysis comments on pull requests
- Smart contract change detection
- Auto-labeling of crypto/blockchain issues
- Bot commands via issue comments
- Repository monitoring initialization

### 🌐 **Multi-Network Support**
- Ethereum Mainnet
- Polygon
- Arbitrum
- Optimism
- BNB Smart Chain

## Architecture

```
GitHub ↔ Webhook Handler ↔ API Services ↔ Monitoring Services
                ↓              ↓               ↓
           Crypto APIs    External APIs    Blockchain RPCs
```

## Quick Start

### Prerequisites
- Node.js 18+ 
- GitHub App credentials
- API keys for various services

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/crypto-intel-github-bot.git
   cd crypto-intel-github-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp config.example.env .env
   # Edit .env with your API keys and configuration
   ```

4. **Configure GitHub App**
   - Create a GitHub App in your GitHub settings
   - Download the private key and place it in the project root
   - Update the environment variables with your app credentials

5. **Start the application**
   ```bash
   npm start
   ```

## Configuration

### Required Environment Variables

#### GitHub App Configuration
```env
GITHUB_APP_ID=your_github_app_id
GITHUB_PRIVATE_KEY_PATH=./private-key.pem
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

#### API Keys
```env
COINGECKO_API_KEY=your_coingecko_api_key
COINDESK_API_KEY=your_coindesk_api_key
ARKHAM_INTEL_API_KEY=your_arkham_intel_api_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```

#### Blockchain RPC URLs
```env
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your_infura_key
POLYGON_RPC_URL=https://polygon-mainnet.infura.io/v3/your_infura_key
```

See `config.example.env` for the complete list of configuration options.

## Usage

### Bot Commands

Mention the bot in issue comments to trigger actions:

```
@crypto-intel-bot analyze
```
Triggers gas analysis for the repository

```
@crypto-intel-bot monitor
```
Activates network monitoring for the repository

```
@crypto-intel-bot status
```
Shows current status of all services

### Automated Features

- **Smart Contract Detection**: Automatically detects when smart contracts are added or modified
- **Gas Analysis**: Provides gas estimation comments on relevant pull requests  
- **Issue Auto-labeling**: Automatically labels crypto/blockchain related issues
- **Deployment Monitoring**: Tracks contract deployments across supported networks

### API Endpoints

- `GET /health` - Health check
- `GET /api/status` - Service status
- `POST /api/trigger/gas-analysis` - Manual gas analysis trigger
- `POST /api/trigger/network-monitor` - Manual network monitoring trigger

## Services

### API Services
- **CoinGecko Service**: Market data, trending coins, DeFi metrics
- **CoinDesk Service**: Bitcoin price tracking and analysis  
- **Arkham Intel Service**: Blockchain intelligence and transaction insights

### Monitoring Services
- **Gas Estimation Service**: Multi-network gas price monitoring and analysis
- **Network Monitoring Service**: Contract deployment tracking and activity monitoring
- **DeFi Monitoring Service**: Protocol metrics and liquidity tracking

## Deployment

### Docker (Recommended)
```bash
docker build -t crypto-intel-bot .
docker run -d --env-file .env crypto-intel-bot
```

### Manual Deployment
1. Set up environment variables on your server
2. Install dependencies: `npm install --production`
3. Start with PM2: `pm2 start src/index.js --name crypto-intel-bot`

### Cloud Platforms
- **Heroku**: Use the included `Procfile`
- **Vercel**: Serverless deployment supported
- **AWS/GCP/Azure**: Standard Node.js deployment

## Development

### Running in Development
```bash
npm run dev
```

### Testing
```bash
npm test
```

### Linting
```bash
npm run lint
npm run format
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## API Key Setup

To use this bot, you'll need API keys from the following services:

### Required APIs
1. **GitHub App**: Create at https://github.com/settings/apps
2. **Infura**: Get RPC URLs at https://infura.io
3. **Etherscan**: API key at https://etherscan.io/apis

### Optional APIs (Enhanced Features)
1. **CoinGecko Pro**: https://www.coingecko.com/en/api
2. **CoinDesk**: Contact for API access
3. **Arkham Intel**: Contact for API access

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- Create an issue for bug reports or feature requests
- Check the [documentation](docs/) for detailed guides
- Join our [Discord community](link-to-discord) for support

## Roadmap

- [ ] Additional DeFi protocol integrations
- [ ] MEV detection and analysis
- [ ] Cross-chain bridge monitoring
- [ ] Advanced contract security scanning
- [ ] Machine learning price predictions
- [ ] NFT marketplace tracking

---

by thecryptoadvisorof
