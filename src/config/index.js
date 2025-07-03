const fs = require('fs');
const path = require('path');

const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  
  github: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: getPrivateKey(),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  },
  
  apis: {
    coingecko: {
      apiKey: process.env.COINGECKO_API_KEY,
      baseUrl: 'https://api.coingecko.com/api/v3',
      proBaseUrl: 'https://pro-api.coingecko.com/api/v3',
    },
    coindesk: {
      apiKey: process.env.COINDESK_API_KEY,
      baseUrl: 'https://api.coindesk.com/v1',
    },
    arkhamIntel: {
      apiKey: process.env.ARKHAM_INTEL_API_KEY,
      baseUrl: 'https://api.arkhamintelligence.com/v1',
    },
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY,
      baseUrl: 'https://api.etherscan.io/api',
    },
    polygonscan: {
      apiKey: process.env.POLYGONSCAN_API_KEY,
      baseUrl: 'https://api.polygonscan.com/api',
    },
    arbiscan: {
      apiKey: process.env.ARBISCAN_API_KEY,
      baseUrl: 'https://api.arbiscan.io/api',
    },
    solscan: {
      apiKey: process.env.SOLSCAN_API_KEY,
      baseUrl: 'https://api.solscan.io',
    },
    defipulse: {
      apiKey: process.env.DEFIPULSE_API_KEY,
      baseUrl: 'https://data-api.defipulse.com/api/v1',
    },
  },
  
  blockchain: {
    rpcUrls: {
      ethereum: process.env.ETHEREUM_RPC_URL,
      polygon: process.env.POLYGON_RPC_URL,
      arbitrum: process.env.ARBITRUM_RPC_URL,
      optimism: process.env.OPTIMISM_RPC_URL,
      bsc: process.env.BSC_RPC_URL,
      solana: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    },
    networks: {
      ethereum: {
        chainId: 1,
        name: 'Ethereum Mainnet',
        explorer: 'https://etherscan.io',
      },
      polygon: {
        chainId: 137,
        name: 'Polygon Mainnet',
        explorer: 'https://polygonscan.com',
      },
      arbitrum: {
        chainId: 42161,
        name: 'Arbitrum One',
        explorer: 'https://arbiscan.io',
      },
      optimism: {
        chainId: 10,
        name: 'Optimism',
        explorer: 'https://optimistic.etherscan.io',
      },
      bsc: {
        chainId: 56,
        name: 'BNB Smart Chain',
        explorer: 'https://bscscan.com',
      },
      solana: {
        chainId: 'mainnet-beta',
        name: 'Solana Mainnet',
        explorer: 'https://solscan.io',
      },
    },
  },
  
  defi: {
    protocols: {
      uniswap: {
        subgraphUrl: process.env.UNISWAP_SUBGRAPH_URL || 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
        contractAddresses: {
          ethereum: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // V3 Factory
          polygon: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
          arbitrum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        },
      },
      aave: {
        apiUrl: process.env.AAVE_API_URL || 'https://api.aave.com/data',
        contractAddresses: {
          ethereum: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9', // Lending Pool
          polygon: '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf',
          arbitrum: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        },
      },
      compound: {
        apiUrl: process.env.COMPOUND_API_URL || 'https://api.compound.finance/api/v2',
        contractAddresses: {
          ethereum: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B', // Comptroller
        },
      },
    },
  },
  
  monitoring: {
    updateIntervalMinutes: parseInt(process.env.UPDATE_INTERVAL_MINUTES) || 30,
    gasPriceThresholdGwei: parseInt(process.env.GAS_PRICE_THRESHOLD_GWEI) || 50,
    priceChangeThresholdPercent: parseFloat(process.env.PRICE_CHANGE_THRESHOLD_PERCENT) || 5,
    maxRetries: 3,
    retryDelayMs: 5000,
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs/app.log',
  },
};

function getPrivateKey() {
  const privateKeyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
  
  if (privateKeyPath && fs.existsSync(privateKeyPath)) {
    return fs.readFileSync(privateKeyPath, 'utf8');
  }
  
  // Fallback to environment variable (for deployment environments)
  if (process.env.GITHUB_PRIVATE_KEY) {
    return process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  
  throw new Error('GitHub private key not found. Set GITHUB_PRIVATE_KEY_PATH or GITHUB_PRIVATE_KEY environment variable.');
}

// Validation
function validateConfig() {
  const required = [
    'GITHUB_APP_ID',
    'GITHUB_WEBHOOK_SECRET',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  if (!config.github.privateKey) {
    throw new Error('GitHub private key is required');
  }
}

// Only validate in production
if (config.server.nodeEnv === 'production') {
  validateConfig();
}

module.exports = config; 