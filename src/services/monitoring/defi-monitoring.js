const axios = require('axios');
const logger = require('../../utils/logger');
const config = require('../../config');

class DeFiMonitoringService {
  constructor() {
    this.cache = new Map();
    this.protocols = config.defi.protocols;
  }

  async initialize() {
    try {
      await this.healthCheck();
      logger.info('DeFi monitoring service initialized successfully');
    } catch (error) {
      logger.error('DeFi monitoring service initialization failed:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      // Test connectivity to DeFi data sources
      const testPromises = Object.keys(this.protocols).map(async (protocol) => {
        try {
          await this.getProtocolData(protocol);
          return { protocol, status: 'healthy' };
        } catch (error) {
          return { protocol, status: 'error', error: error.message };
        }
      });

      const results = await Promise.allSettled(testPromises);
      const protocolStatuses = results.map(r => r.status === 'fulfilled' ? r.value : r.reason);
      
      return {
        status: 'healthy',
        protocols: protocolStatuses,
        monitoredProtocols: Object.keys(this.protocols).length,
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  async getProtocolData(protocolName) {
    const cacheKey = `protocol-${protocolName}`;
    const cached = this.getCachedData(cacheKey, 5 * 60 * 1000); // 5 minutes
    
    if (cached) return cached;

    try {
      let data;
      
      switch (protocolName) {
        case 'uniswap':
          data = await this.getUniswapData();
          break;
        case 'aave':
          data = await this.getAaveData();
          break;
        case 'compound':
          data = await this.getCompoundData();
          break;
        default:
          throw new Error(`Unknown protocol: ${protocolName}`);
      }

      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error(`Failed to get data for ${protocolName}:`, error);
      throw error;
    }
  }

  async getUniswapData() {
    const query = `
      {
        protocol(id: "1") {
          totalValueLockedUSD
          totalVolumeUSD
        }
        pools(first: 10, orderBy: totalValueLockedUSD, orderDirection: desc) {
          id
          token0 { symbol }
          token1 { symbol }
          totalValueLockedUSD
          volumeUSD
        }
      }
    `;

    const response = await axios.post(this.protocols.uniswap.subgraphUrl, { query });
    return response.data.data;
  }

  async getAaveData() {
    // Placeholder for Aave API integration
    return {
      totalValueLocked: 0,
      totalBorrowed: 0,
      reserves: [],
    };
  }

  async getCompoundData() {
    // Placeholder for Compound API integration
    return {
      totalValueLocked: 0,
      totalBorrowed: 0,
      markets: [],
    };
  }

  async updateAllProtocols() {
    try {
      const updates = {};
      
      for (const protocolName of Object.keys(this.protocols)) {
        try {
          updates[protocolName] = await this.getProtocolData(protocolName);
        } catch (error) {
          logger.error(`Failed to update ${protocolName}:`, error);
          updates[protocolName] = { error: error.message };
        }
      }

      logger.cryptoEvent('defi_protocols_updated', {
        protocolsUpdated: Object.keys(updates).length,
        timestamp: new Date().toISOString(),
      });

      return updates;
    } catch (error) {
      logger.error('Failed to update all protocols:', error);
      throw error;
    }
  }

  getCachedData(key, maxAge) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > maxAge) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }
}

module.exports = new DeFiMonitoringService(); 