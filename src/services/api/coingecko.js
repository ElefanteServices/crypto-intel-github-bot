const axios = require('axios');
const logger = require('../../utils/logger');
const config = require('../../config');

class CoinGeckoService {
  constructor() {
    this.apiKey = config.apis.coingecko.apiKey;
    this.baseUrl = this.apiKey ? config.apis.coingecko.proBaseUrl : config.apis.coingecko.baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: this.apiKey ? { 'X-Cg-Pro-Api-Key': this.apiKey } : {},
    });
    
    this.cache = new Map();
    this.rateLimitDelay = this.apiKey ? 100 : 1000; // Pro: 10 req/s, Free: 1 req/s
    this.lastRequestTime = 0;
  }

  async initialize() {
    try {
      await this.healthCheck();
      logger.info('CoinGecko service initialized successfully');
    } catch (error) {
      logger.error('CoinGecko service initialization failed:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const startTime = Date.now();
      const response = await this.makeRequest('/ping');
      const duration = Date.now() - startTime;
      
      logger.apiCall('coingecko', '/ping', duration, response.status);
      
      return {
        status: 'healthy',
        responseTime: duration,
        rateLimit: this.apiKey ? 'pro' : 'free',
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  async makeRequest(endpoint, params = {}) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();

    try {
      const response = await this.client.get(endpoint, { params });
      return response.data;
    } catch (error) {
      logger.error(`CoinGecko API error for ${endpoint}:`, {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      throw error;
    }
  }

  async getTopCryptos(limit = 100) {
    const cacheKey = `top-cryptos-${limit}`;
    const cached = this.getCachedData(cacheKey, 5 * 60 * 1000); // 5 minutes cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/coins/markets', {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: limit,
        page: 1,
        sparkline: false,
        price_change_percentage: '1h,24h,7d,30d',
      });

      this.setCachedData(cacheKey, data);
      
      logger.cryptoEvent('market_data_updated', {
        source: 'coingecko',
        cryptoCount: data.length,
      });

      return data;
    } catch (error) {
      logger.error('Failed to get top cryptos:', error);
      throw error;
    }
  }

  async getCoinData(coinId) {
    const cacheKey = `coin-${coinId}`;
    const cached = this.getCachedData(cacheKey, 2 * 60 * 1000); // 2 minutes cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest(`/coins/${coinId}`, {
        localization: false,
        tickers: false,
        market_data: true,
        community_data: false,
        developer_data: false,
        sparkline: false,
      });

      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error(`Failed to get coin data for ${coinId}:`, error);
      throw error;
    }
  }

  async getTrendingCoins() {
    const cacheKey = 'trending-coins';
    const cached = this.getCachedData(cacheKey, 10 * 60 * 1000); // 10 minutes cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/search/trending');
      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error('Failed to get trending coins:', error);
      throw error;
    }
  }

  async getGlobalMarketData() {
    const cacheKey = 'global-market';
    const cached = this.getCachedData(cacheKey, 5 * 60 * 1000); // 5 minutes cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/global');
      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error('Failed to get global market data:', error);
      throw error;
    }
  }

  async getDefiData() {
    const cacheKey = 'defi-data';
    const cached = this.getCachedData(cacheKey, 10 * 60 * 1000); // 10 minutes cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/global/decentralized_finance_defi');
      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error('Failed to get DeFi data:', error);
      throw error;
    }
  }

  async updateTopCryptos() {
    try {
      const topCryptos = await this.getTopCryptos(50);
      const trendingCoins = await this.getTrendingCoins();
      const globalData = await this.getGlobalMarketData();
      const defiData = await this.getDefiData();

      const marketAnalysis = this.analyzeMarketConditions(topCryptos, globalData);
      
      logger.cryptoEvent('market_analysis_completed', {
        topCryptos: topCryptos.length,
        trendingCount: trendingCoins.coins?.length || 0,
        totalMarketCap: globalData.data?.total_market_cap?.usd,
        btcDominance: globalData.data?.market_cap_percentage?.btc,
        defiTvl: defiData.data?.defi_market_cap,
        marketCondition: marketAnalysis.condition,
      });

      return {
        topCryptos,
        trending: trendingCoins,
        global: globalData,
        defi: defiData,
        analysis: marketAnalysis,
      };
    } catch (error) {
      logger.error('Failed to update top cryptos:', error);
      throw error;
    }
  }

  analyzeMarketConditions(topCryptos, globalData) {
    const analysis = {
      condition: 'neutral',
      indicators: {},
      alerts: [],
    };

    if (!topCryptos || topCryptos.length === 0) return analysis;

    // Calculate market indicators
    const priceChanges24h = topCryptos
      .map(coin => coin.price_change_percentage_24h)
      .filter(change => change !== null);

    if (priceChanges24h.length > 0) {
      const avgChange = priceChanges24h.reduce((sum, change) => sum + change, 0) / priceChanges24h.length;
      const positiveCount = priceChanges24h.filter(change => change > 0).length;
      const positiveRatio = positiveCount / priceChanges24h.length;

      analysis.indicators = {
        averageChange24h: avgChange,
        positiveRatio,
        greenCoins: positiveCount,
        totalCoins: priceChanges24h.length,
      };

      // Determine market condition
      if (avgChange > 5 && positiveRatio > 0.7) {
        analysis.condition = 'bullish';
      } else if (avgChange < -5 && positiveRatio < 0.3) {
        analysis.condition = 'bearish';
      }

      // Generate alerts
      if (Math.abs(avgChange) > config.monitoring.priceChangeThresholdPercent) {
        analysis.alerts.push({
          type: avgChange > 0 ? 'pump' : 'dump',
          message: `Market wide ${avgChange > 0 ? 'pump' : 'dump'} detected: ${avgChange.toFixed(2)}% average change`,
          severity: Math.abs(avgChange) > 10 ? 'high' : 'medium',
        });
      }
    }

    return analysis;
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

    // Clean old cache entries periodically
    if (this.cache.size > 100) {
      const oldestKeys = Array.from(this.cache.keys()).slice(0, 20);
      oldestKeys.forEach(key => this.cache.delete(key));
    }
  }

  async searchCoins(query) {
    try {
      const data = await this.makeRequest('/search', { query });
      return data;
    } catch (error) {
      logger.error(`Failed to search coins for "${query}":`, error);
      throw error;
    }
  }

  async getCoinHistory(coinId, days = 30) {
    try {
      const data = await this.makeRequest(`/coins/${coinId}/market_chart`, {
        vs_currency: 'usd',
        days,
        interval: days > 30 ? 'daily' : 'hourly',
      });
      return data;
    } catch (error) {
      logger.error(`Failed to get coin history for ${coinId}:`, error);
      throw error;
    }
  }
}

module.exports = new CoinGeckoService(); 