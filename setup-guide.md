# API Key Setup Guide

This guide will help you obtain all the necessary API keys to run the Crypto Intel GitHub Bot.

## Required API Keys

### 1. GitHub App (Required)

**Steps:**
1. Go to https://github.com/settings/apps
2. Click "New GitHub App"
3. Fill in the required information:
   - **GitHub App name**: `crypto-intel-bot-[your-username]`
   - **Homepage URL**: Your repository URL
   - **Webhook URL**: `https://your-domain.com/webhooks/github`
   - **Webhook secret**: Generate a secure random string
4. Set permissions:
   - Repository permissions:
     - Contents: Read
     - Issues: Write
     - Pull requests: Write
     - Metadata: Read
   - Subscribe to events:
     - Push
     - Pull request
     - Issues
     - Issue comment
5. Click "Create GitHub App"
6. Download the private key file
7. Note your App ID

### 2. Blockchain RPC URLs (Required)

**Infura (Recommended)**
1. Go to https://infura.io
2. Sign up for a free account
3. Create a new project
4. Copy the project ID
5. Use these URLs:
   - Ethereum: `https://mainnet.infura.io/v3/YOUR_PROJECT_ID`
   - Polygon: `https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID`
   - Arbitrum: `https://arbitrum-mainnet.infura.io/v3/YOUR_PROJECT_ID`

**Alternative: Alchemy**
1. Go to https://alchemy.com
2. Create a free account
3. Create apps for each network you want to support

### 3. Blockchain Explorers (Required)

**Etherscan**
1. Go to https://etherscan.io/apis
2. Sign up for a free account
3. Create a new API key
4. Free tier: 5 calls/second

**Polygonscan**
1. Go to https://polygonscan.com/apis
2. Sign up for a free account
3. Create a new API key

**Arbiscan**
1. Go to https://arbiscan.io/apis
2. Sign up for a free account  
3. Create a new API key

## Optional API Keys (Enhanced Features)

### 4. CoinGecko (Market Data)

**Free Tier**
- No API key required
- 50 calls/minute
- Basic endpoints

**Pro Tier (Recommended)**
1. Go to https://www.coingecko.com/en/api
2. Choose a plan ($129/month+)
3. Get your API key
4. 500+ calls/minute
5. Advanced endpoints

### 5. CoinDesk (Bitcoin Data)

**Note**: CoinDesk API v1 is free and doesn't require an API key for basic Bitcoin price data.

For advanced features, contact CoinDesk directly.

### 6. Arkham Intel (Advanced Analytics)

1. Contact Arkham Intel for API access
2. This is typically for enterprise customers
3. Provides advanced blockchain intelligence features

**Note**: The bot will work without this API key, but some advanced features will be disabled.

## Environment Setup

1. Copy `config.example.env` to `.env`
2. Fill in your API keys:

```env
# GitHub App (Required)
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY_PATH=./private-key.pem
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Blockchain RPCs (Required)
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your_infura_key
POLYGON_RPC_URL=https://polygon-mainnet.infura.io/v3/your_infura_key

# Explorers (Required)
ETHERSCAN_API_KEY=your_etherscan_key
POLYGONSCAN_API_KEY=your_polygonscan_key

# Market Data (Optional)
COINGECKO_API_KEY=your_coingecko_pro_key

# Advanced Analytics (Optional)
ARKHAM_INTEL_API_KEY=your_arkham_key
```

## Cost Estimates

### Free Tier (Basic functionality)
- GitHub App: Free
- Infura: Free (100,000 requests/day)
- Etherscan: Free (5 calls/second)
- CoinGecko: Free (50 calls/minute)
- **Total: $0/month**

### Recommended Tier (Full functionality)
- GitHub App: Free
- Infura Pro: $50/month
- Etherscan Pro: $49/month  
- CoinGecko Pro: $129/month
- **Total: ~$228/month**

### Enterprise Tier (Maximum features)
- All above services at higher tiers
- Arkham Intel: Contact for pricing
- **Total: $500+/month**

## Testing Your Setup

After setting up your API keys:

1. Start the bot: `npm start`
2. Check the health endpoint: `GET /health`
3. Check service status: `GET /api/status`
4. Install the GitHub app on a test repository
5. Create an issue and mention `@crypto-intel-bot status`

## Security Best Practices

1. **Never commit API keys to your repository**
2. **Use environment variables in production**
3. **Rotate API keys regularly**
4. **Monitor API usage and costs**
5. **Use the least privileged access necessary**
6. **Keep your GitHub App private key secure**

## Troubleshooting

### Common Issues

**"API key not configured" errors**
- Check your `.env` file exists
- Verify environment variable names match exactly
- Restart the application after changing `.env`

**"Provider not available" errors**
- Check your RPC URLs are correct
- Verify your Infura/Alchemy project is active
- Test the RPC URL manually

**GitHub webhook not receiving events**
- Verify webhook URL is accessible from the internet
- Check webhook secret matches your configuration
- Look at webhook delivery logs in GitHub

### Getting Help

1. Check the application logs: `tail -f logs/app.log`
2. Test individual services via the status endpoint
3. Create an issue in the repository
4. Contact the respective API providers for service-specific issues

---

**Ready to get started?** Once you have your API keys, follow the main README installation guide! 