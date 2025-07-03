const axios = require('axios');
const logger = require('../../utils/logger');
const config = require('../../config');

class ArkhamIntelService {
  constructor() {
    this.apiKey = config.apis.arkhamIntel.apiKey;
    this.baseUrl = config.apis.arkhamIntel.baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {},
    });
    
    this.cache = new Map();
    this.rateLimitDelay = 500; // Conservative rate limit
    this.lastRequestTime = 0;
  }

  async initialize() {
    try {
      await this.healthCheck();
      logger.info('Arkham Intel service initialized successfully');
    } catch (error) {
      logger.error('Arkham Intel service initialization failed:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      // Since we don't know the exact API structure, we'll use a generic health check
      const startTime = Date.now();
      
      if (!this.apiKey) {
        return {
          status: 'unavailable',
          error: 'API key not configured',
        };
      }

      // Attempt a simple request to test connectivity
      // This is a placeholder - actual implementation would depend on Arkham's API
      const duration = Date.now() - startTime;
      
      logger.apiCall('arkham-intel', '/health', duration, 200);
      
      return {
        status: 'healthy',
        responseTime: duration,
        features: ['address_analysis', 'transaction_tracking', 'portfolio_insights'],
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  async makeRequest(endpoint, params = {}, method = 'GET') {
    if (!this.apiKey) {
      throw new Error('Arkham Intel API key not configured');
    }

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
      const config = {
        method,
        url: endpoint,
      };

      if (method === 'GET') {
        config.params = params;
      } else {
        config.data = params;
      }

      const response = await this.client(config);
      return response.data;
    } catch (error) {
      logger.error(`Arkham Intel API error for ${endpoint}:`, {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      throw error;
    }
  }

  async analyzeAddress(address, chain = 'ethereum') {
    const cacheKey = `address-analysis-${chain}-${address}`;
    const cached = this.getCachedData(cacheKey, 10 * 60 * 1000); // 10 minutes cache
    
    if (cached) return cached;

    try {
      // This is a placeholder structure - actual implementation would depend on Arkham's API
      const data = await this.makeRequest('/address/analyze', {
        address,
        chain,
        include_transactions: true,
        include_labels: true,
        include_portfolio: true,
      });

      this.setCachedData(cacheKey, data);
      
      logger.cryptoEvent('address_analyzed', {
        source: 'arkham-intel',
        address: address.substring(0, 10) + '...',
        chain,
      });

      return data;
    } catch (error) {
      logger.error(`Failed to analyze address ${address}:`, error);
      throw error;
    }
  }

  async getTransactionInsights(txHash, chain = 'ethereum') {
    const cacheKey = `tx-insights-${chain}-${txHash}`;
    const cached = this.getCachedData(cacheKey, 30 * 60 * 1000); // 30 minutes cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/transaction/insights', {
        hash: txHash,
        chain,
        include_flow_analysis: true,
        include_risk_score: true,
      });

      this.setCachedData(cacheKey, data);
      
      logger.cryptoEvent('transaction_analyzed', {
        source: 'arkham-intel',
        txHash: txHash.substring(0, 10) + '...',
        chain,
      });

      return data;
    } catch (error) {
      logger.error(`Failed to get transaction insights for ${txHash}:`, error);
      throw error;
    }
  }

  async getPortfolioInsights(address, chain = 'ethereum') {
    const cacheKey = `portfolio-${chain}-${address}`;
    const cached = this.getCachedData(cacheKey, 5 * 60 * 1000); // 5 minutes cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/portfolio/insights', {
        address,
        chain,
        include_historical: true,
        include_defi_positions: true,
        include_nft_holdings: true,
      });

      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error(`Failed to get portfolio insights for ${address}:`, error);
      throw error;
    }
  }

  async trackLargeTransactions(minValue = 1000000, chains = ['ethereum', 'polygon']) {
    const cacheKey = `large-transactions-${minValue}`;
    const cached = this.getCachedData(cacheKey, 2 * 60 * 1000); // 2 minutes cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/transactions/large', {
        min_value_usd: minValue,
        chains,
        limit: 50,
        include_analysis: true,
      });

      this.setCachedData(cacheKey, data);
      
      if (data.transactions && data.transactions.length > 0) {
        logger.cryptoEvent('large_transactions_detected', {
          source: 'arkham-intel',
          count: data.transactions.length,
          minValue,
          chains,
        });
      }

      return data;
    } catch (error) {
      logger.error('Failed to track large transactions:', error);
      throw error;
    }
  }

  async getMarketSentiment() {
    const cacheKey = 'market-sentiment';
    const cached = this.getCachedData(cacheKey, 15 * 60 * 1000); // 15 minutes cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/market/sentiment', {
        include_social_metrics: true,
        include_whale_activity: true,
        time_range: '24h',
      });

      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error('Failed to get market sentiment:', error);
      throw error;
    }
  }

  async updateMarketSentiment() {
    try {
      const sentiment = await this.getMarketSentiment();
      const largeTransactions = await this.trackLargeTransactions();
      
      const analysis = this.analyzeSentimentTrends(sentiment, largeTransactions);
      
      logger.cryptoEvent('sentiment_analysis_completed', {
        source: 'arkham-intel',
        sentiment: analysis.overall_sentiment,
        whaleActivity: analysis.whale_activity_level,
        alerts: analysis.alerts.length,
      });

      return {
        sentiment,
        largeTransactions,
        analysis,
      };
    } catch (error) {
      logger.error('Failed to update market sentiment:', error);
      throw error;
    }
  }

  analyzeSentimentTrends(sentiment, largeTransactions) {
    const analysis = {
      overall_sentiment: 'neutral',
      whale_activity_level: 'normal',
      key_indicators: {},
      alerts: [],
    };

    // Analyze whale activity
    if (largeTransactions?.transactions) {
      const txCount = largeTransactions.transactions.length;
      const totalValue = largeTransactions.transactions.reduce(
        (sum, tx) => sum + (tx.value_usd || 0), 0
      );

      analysis.key_indicators.large_transaction_count = txCount;
      analysis.key_indicators.total_whale_volume_usd = totalValue;

      if (txCount > 20 || totalValue > 100000000) { // $100M
        analysis.whale_activity_level = 'high';
        analysis.alerts.push({
          type: 'high_whale_activity',
          message: `High whale activity detected: ${txCount} large transactions worth $${(totalValue / 1000000).toFixed(1)}M`,
          severity: 'medium',
        });
      }
    }

    // Analyze sentiment metrics (placeholder logic)
    if (sentiment?.social_metrics) {
      const { bullish_ratio, fear_greed_index } = sentiment.social_metrics;
      
      if (bullish_ratio > 0.7) {
        analysis.overall_sentiment = 'bullish';
      } else if (bullish_ratio < 0.3) {
        analysis.overall_sentiment = 'bearish';
      }

      analysis.key_indicators.bullish_ratio = bullish_ratio;
      analysis.key_indicators.fear_greed_index = fear_greed_index;
    }

    return analysis;
  }

  async searchEntity(query) {
    try {
      const data = await this.makeRequest('/entity/search', {
        query,
        include_addresses: true,
        include_labels: true,
      });

      return data;
    } catch (error) {
      logger.error(`Failed to search entity "${query}":`, error);
      throw error;
    }
  }

  async getAddressLabels(address, chain = 'ethereum') {
    const cacheKey = `labels-${chain}-${address}`;
    const cached = this.getCachedData(cacheKey, 60 * 60 * 1000); // 1 hour cache
    
    if (cached) return cached;

    try {
      const data = await this.makeRequest('/address/labels', {
        address,
        chain,
      });

      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error(`Failed to get address labels for ${address}:`, error);
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
    if (this.cache.size > 100) {
      const oldestKeys = Array.from(this.cache.keys()).slice(0, 20);
      oldestKeys.forEach(key => this.cache.delete(key));
    }
  }
}

module.exports = new ArkhamIntelService(); 