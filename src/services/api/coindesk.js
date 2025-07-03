const axios = require('axios');
const logger = require('../../utils/logger');
const config = require('../../config');

class CoinDeskService {
  constructor() {
    this.apiKey = config.apis.coindesk.apiKey;
    this.baseUrl = config.apis.coindesk.baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {},
    });
    
    this.cache = new Map();
    this.rateLimitDelay = 1000; // 1 request per second
    this.lastRequestTime = 0;
  }

  async initialize() {
    try {
      await this.healthCheck();
      logger.info('CoinDesk service initialized successfully');
    } catch (error) {
      logger.error('CoinDesk service initialization failed:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const startTime = Date.now();
      const response = await this.getCurrentBitcoinPrice();
      const duration = Date.now() - startTime;
      
      logger.apiCall('coindesk', '/bpi/currentprice', duration, 200);
      
      return {
        status: 'healthy',
        responseTime: duration,
        lastPrice: response.bpi?.USD?.rate,
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
      logger.error(`CoinDesk API error for ${endpoint}:`, {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      throw error;
    }
  }

  async getCurrentBitcoinPrice() {
    const cacheKey = 'btc-current-price';
    const cached = this.getCachedData(cacheKey, 60 * 1000); // 1 minute cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/bpi/currentprice.json');
      this.setCachedData(cacheKey, data);
      
      logger.cryptoEvent('btc_price_updated', {
        source: 'coindesk',
        price: data.bpi?.USD?.rate_float,
        currency: 'USD',
      });

      return data;
    } catch (error) {
      logger.error('Failed to get current Bitcoin price:', error);
      throw error;
    }
  }

  async getHistoricalBitcoinPrice(startDate, endDate) {
    const cacheKey = `btc-historical-${startDate}-${endDate}`;
    const cached = this.getCachedData(cacheKey, 60 * 60 * 1000); // 1 hour cache
    
    if (cached) return cached;

    try {
      const params = {};
      if (startDate) params.start = startDate;
      if (endDate) params.end = endDate;

      const data = await this.makeRequest('/bpi/historical/close.json', params);
      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error('Failed to get historical Bitcoin price:', error);
      throw error;
    }
  }

  async updateBitcoinData() {
    try {
      const currentPrice = await this.getCurrentBitcoinPrice();
      
      // Get 30-day historical data for trend analysis
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      
      const historicalData = await this.getHistoricalBitcoinPrice(startDate, endDate);
      
      const analysis = this.analyzeBitcoinTrend(currentPrice, historicalData);
      
      logger.cryptoEvent('bitcoin_analysis_completed', {
        currentPrice: currentPrice.bpi?.USD?.rate_float,
        trend: analysis.trend,
        change30d: analysis.change30d,
        volatility: analysis.volatility,
      });

      return {
        current: currentPrice,
        historical: historicalData,
        analysis,
      };
    } catch (error) {
      logger.error('Failed to update Bitcoin data:', error);
      throw error;
    }
  }

  analyzeBitcoinTrend(currentPrice, historicalData) {
    const analysis = {
      trend: 'neutral',
      change30d: 0,
      volatility: 'low',
      support: null,
      resistance: null,
      alerts: [],
    };

    if (!currentPrice?.bpi?.USD?.rate_float || !historicalData?.bpi) {
      return analysis;
    }

    const currentPriceValue = currentPrice.bpi.USD.rate_float;
    const historicalPrices = Object.values(historicalData.bpi);
    
    if (historicalPrices.length === 0) return analysis;

    // Calculate 30-day change
    const oldestPrice = historicalPrices[0];
    analysis.change30d = ((currentPriceValue - oldestPrice) / oldestPrice) * 100;

    // Determine trend
    if (analysis.change30d > 10) {
      analysis.trend = 'bullish';
    } else if (analysis.change30d < -10) {
      analysis.trend = 'bearish';
    }

    // Calculate volatility (standard deviation)
    const mean = historicalPrices.reduce((sum, price) => sum + price, 0) / historicalPrices.length;
    const variance = historicalPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / historicalPrices.length;
    const stdDev = Math.sqrt(variance);
    const volatilityPercent = (stdDev / mean) * 100;

    if (volatilityPercent > 5) {
      analysis.volatility = 'high';
    } else if (volatilityPercent > 2) {
      analysis.volatility = 'medium';
    }

    // Calculate support and resistance
    analysis.support = Math.min(...historicalPrices);
    analysis.resistance = Math.max(...historicalPrices);

    // Generate alerts
    if (Math.abs(analysis.change30d) > 20) {
      analysis.alerts.push({
        type: analysis.change30d > 0 ? 'strong_uptrend' : 'strong_downtrend',
        message: `Bitcoin ${analysis.change30d > 0 ? 'gained' : 'lost'} ${Math.abs(analysis.change30d).toFixed(2)}% in 30 days`,
        severity: 'high',
      });
    }

    if (volatilityPercent > 8) {
      analysis.alerts.push({
        type: 'high_volatility',
        message: `Bitcoin showing high volatility: ${volatilityPercent.toFixed(2)}%`,
        severity: 'medium',
      });
    }

    return analysis;
  }

  async fetchLatestNews() {
    // Note: CoinDesk API v1 doesn't have a news endpoint
    // This would typically integrate with CoinDesk's news RSS or a news aggregation service
    try {
      logger.info('News fetching would be implemented here with RSS or news API');
      
      // Placeholder for news fetching logic
      const mockNews = {
        articles: [],
        timestamp: new Date().toISOString(),
        source: 'coindesk',
      };

      return mockNews;
    } catch (error) {
      logger.error('Failed to fetch latest news:', error);
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

    // Clean old cache entries periodically
    if (this.cache.size > 50) {
      const oldestKeys = Array.from(this.cache.keys()).slice(0, 10);
      oldestKeys.forEach(key => this.cache.delete(key));
    }
  }

  async getBitcoinPriceForDate(date) {
    try {
      const data = await this.makeRequest(`/bpi/historical/close/${date}.json`);
      return data;
    } catch (error) {
      logger.error(`Failed to get Bitcoin price for date ${date}:`, error);
      throw error;
    }
  }

  async getBitcoinPriceIndex() {
    const cacheKey = 'btc-price-index';
    const cached = this.getCachedData(cacheKey, 5 * 60 * 1000); // 5 minutes cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/bpi/currentprice.json');
      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error('Failed to get Bitcoin price index:', error);
      throw error;
    }
  }
}

module.exports = new CoinDeskService(); 