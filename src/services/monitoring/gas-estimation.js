const { ethers } = require('ethers');
const axios = require('axios');
const logger = require('../../utils/logger');
const config = require('../../config');

class GasEstimationService {
  constructor() {
    this.providers = {};
    this.cache = new Map();
    this.initializeProviders();
  }

  initializeProviders() {
    // Initialize Web3 providers for different networks
    const networks = config.blockchain.networks;
    const rpcUrls = config.blockchain.rpcUrls;

    for (const [networkName, networkConfig] of Object.entries(networks)) {
      if (rpcUrls[networkName]) {
        try {
          this.providers[networkName] = new ethers.JsonRpcProvider(rpcUrls[networkName]);
          logger.info(`Initialized provider for ${networkName}`);
        } catch (error) {
          logger.error(`Failed to initialize provider for ${networkName}:`, error);
        }
      }
    }
  }

  async initialize() {
    try {
      await this.healthCheck();
      logger.info('Gas estimation service initialized successfully');
    } catch (error) {
      logger.error('Gas estimation service initialization failed:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const networkStatuses = {};
      let healthyCount = 0;

      for (const [networkName, provider] of Object.entries(this.providers)) {
        try {
          const blockNumber = await provider.getBlockNumber();
          networkStatuses[networkName] = {
            status: 'healthy',
            blockNumber,
          };
          healthyCount++;
        } catch (error) {
          networkStatuses[networkName] = {
            status: 'error',
            error: error.message,
          };
        }
      }

      const status = healthyCount > 0 ? 'healthy' : 'error';
      
      return {
        status,
        networks: networkStatuses,
        providerCount: Object.keys(this.providers).length,
        healthyNetworks: healthyCount,
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  async getGasPrice(network = 'ethereum') {
    const cacheKey = `gas-price-${network}`;
    const cached = this.getCachedData(cacheKey, 30 * 1000); // 30 seconds cache
    
    if (cached) return cached;

    try {
      const provider = this.providers[network];
      if (!provider) {
        throw new Error(`Provider not available for network: ${network}`);
      }

      const feeData = await provider.getFeeData();
      
      const gasData = {
        network,
        timestamp: new Date().toISOString(),
        gasPrice: feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : null,
        maxFeePerGas: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') : null,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') : null,
        baseFee: null, // Will be calculated if available
      };

      // Get latest block for base fee (EIP-1559)
      if (network === 'ethereum') {
        try {
          const latestBlock = await provider.getBlock('latest');
          if (latestBlock.baseFeePerGas) {
            gasData.baseFee = ethers.formatUnits(latestBlock.baseFeePerGas, 'gwei');
          }
        } catch (error) {
          logger.warn('Failed to get base fee:', error);
        }
      }

      this.setCachedData(cacheKey, gasData);
      
      logger.cryptoEvent('gas_price_updated', {
        network,
        gasPrice: gasData.gasPrice,
        maxFeePerGas: gasData.maxFeePerGas,
      });

      return gasData;
    } catch (error) {
      logger.error(`Failed to get gas price for ${network}:`, error);
      throw error;
    }
  }

  async getAllNetworkGasPrices() {
    const gasPromises = Object.keys(this.providers).map(async (network) => {
      try {
        const gasData = await this.getGasPrice(network);
        return { network, ...gasData };
      } catch (error) {
        logger.error(`Failed to get gas price for ${network}:`, error);
        return {
          network,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    });

    const results = await Promise.allSettled(gasPromises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          network: Object.keys(this.providers)[index],
          error: result.reason.message,
          timestamp: new Date().toISOString(),
        };
      }
    });
  }

  async estimateTransactionCost(to, data, value = '0', network = 'ethereum') {
    try {
      const provider = this.providers[network];
      if (!provider) {
        throw new Error(`Provider not available for network: ${network}`);
      }

      // Estimate gas limit
      const gasLimit = await provider.estimateGas({
        to,
        data,
        value: ethers.parseEther(value),
      });

      // Get current gas prices
      const gasData = await this.getGasPrice(network);
      
      const estimate = {
        network,
        gasLimit: gasLimit.toString(),
        estimatedCosts: {},
        timestamp: new Date().toISOString(),
      };

      // Calculate costs for different gas price scenarios
      if (gasData.gasPrice) {
        const gasPriceWei = ethers.parseUnits(gasData.gasPrice, 'gwei');
        const costWei = gasLimit * gasPriceWei;
        estimate.estimatedCosts.legacy = {
          gasPrice: gasData.gasPrice,
          costWei: costWei.toString(),
          costEth: ethers.formatEther(costWei),
          costUsd: null, // Would need ETH price
        };
      }

      // EIP-1559 costs
      if (gasData.maxFeePerGas && gasData.maxPriorityFeePerGas) {
        const maxFeeWei = ethers.parseUnits(gasData.maxFeePerGas, 'gwei');
        const maxCostWei = gasLimit * maxFeeWei;
        
        estimate.estimatedCosts.eip1559 = {
          maxFeePerGas: gasData.maxFeePerGas,
          maxPriorityFeePerGas: gasData.maxPriorityFeePerGas,
          maxCostWei: maxCostWei.toString(),
          maxCostEth: ethers.formatEther(maxCostWei),
          maxCostUsd: null, // Would need ETH price
        };
      }

      return estimate;
    } catch (error) {
      logger.error('Failed to estimate transaction cost:', error);
      throw error;
    }
  }

  async analyzeSmartContractGas(contractAddress, network = 'ethereum') {
    try {
      const provider = this.providers[network];
      if (!provider) {
        throw new Error(`Provider not available for network: ${network}`);
      }

      // Get contract code
      const code = await provider.getCode(contractAddress);
      if (code === '0x') {
        throw new Error('No contract found at the specified address');
      }

      // Analyze common function signatures and estimate their gas costs
      const commonFunctions = [
        { name: 'transfer', signature: '0xa9059cbb' },
        { name: 'approve', signature: '0x095ea7b3' },
        { name: 'transferFrom', signature: '0x23b872dd' },
        { name: 'mint', signature: '0x40c10f19' },
        { name: 'burn', signature: '0x42966c68' },
      ];

      const functionAnalysis = [];

      for (const func of commonFunctions) {
        try {
          // This is a simplified estimation - in practice, you'd need actual function ABIs
          const gasEstimate = await provider.estimateGas({
            to: contractAddress,
            data: func.signature + '0'.repeat(64), // Dummy parameters
          }).catch(() => null);

          if (gasEstimate) {
            functionAnalysis.push({
              name: func.name,
              signature: func.signature,
              estimatedGas: gasEstimate.toString(),
            });
          }
        } catch (error) {
          // Function might not exist or require specific parameters
          logger.debug(`Could not estimate gas for ${func.name} on ${contractAddress}`);
        }
      }

      const analysis = {
        contractAddress,
        network,
        codeSize: (code.length - 2) / 2, // Remove 0x prefix and convert to bytes
        functions: functionAnalysis,
        timestamp: new Date().toISOString(),
      };

      logger.cryptoEvent('contract_analyzed', {
        contractAddress,
        network,
        functionCount: functionAnalysis.length,
      });

      return analysis;
    } catch (error) {
      logger.error(`Failed to analyze contract gas for ${contractAddress}:`, error);
      throw error;
    }
  }

  async updateGasPrices() {
    try {
      const allGasPrices = await this.getAllNetworkGasPrices();
      
      // Analyze gas price trends and generate alerts
      const analysis = this.analyzeGasTrends(allGasPrices);
      
      logger.cryptoEvent('gas_analysis_completed', {
        networksAnalyzed: allGasPrices.length,
        highGasNetworks: analysis.highGasNetworks.length,
        alerts: analysis.alerts.length,
      });

      return {
        gasPrices: allGasPrices,
        analysis,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to update gas prices:', error);
      throw error;
    }
  }

  analyzeGasTrends(gasPrices) {
    const analysis = {
      highGasNetworks: [],
      alerts: [],
      summary: {
        averageGasPrice: 0,
        highestGasNetwork: null,
        lowestGasNetwork: null,
      },
    };

    const validPrices = gasPrices.filter(gp => gp.gasPrice && !gp.error);
    
    if (validPrices.length === 0) return analysis;

    // Find networks with high gas prices
    const threshold = config.monitoring.gasPriceThresholdGwei;
    
    for (const gasPrice of validPrices) {
      const gasPriceNum = parseFloat(gasPrice.gasPrice);
      
      if (gasPriceNum > threshold) {
        analysis.highGasNetworks.push({
          network: gasPrice.network,
          gasPrice: gasPriceNum,
          severity: gasPriceNum > threshold * 2 ? 'high' : 'medium',
        });

        analysis.alerts.push({
          type: 'high_gas_price',
          network: gasPrice.network,
          message: `High gas price detected on ${gasPrice.network}: ${gasPriceNum.toFixed(2)} gwei`,
          severity: gasPriceNum > threshold * 2 ? 'high' : 'medium',
        });
      }
    }

    // Calculate summary statistics
    const prices = validPrices.map(gp => parseFloat(gp.gasPrice));
    analysis.summary.averageGasPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    
    analysis.summary.highestGasNetwork = validPrices.find(gp => parseFloat(gp.gasPrice) === maxPrice)?.network;
    analysis.summary.lowestGasNetwork = validPrices.find(gp => parseFloat(gp.gasPrice) === minPrice)?.network;

    return analysis;
  }

  async analyzeRepository(owner, repo) {
    // This would analyze smart contracts in a repository
    // For now, this is a placeholder implementation
    try {
      logger.info(`Analyzing repository for gas estimation: ${owner}/${repo}`);
      
      // In a real implementation, this would:
      // 1. Scan repository for Solidity files
      // 2. Compile contracts (if possible)
      // 3. Estimate deployment costs
      // 4. Analyze function gas costs
      // 5. Generate optimization recommendations

      const analysis = {
        repository: `${owner}/${repo}`,
        timestamp: new Date().toISOString(),
        analysis: 'Repository gas analysis would be implemented here',
        recommendations: [
          'Use memory instead of storage where possible',
          'Optimize loop operations',
          'Consider using packed structs',
          'Implement efficient data structures',
        ],
      };

      logger.cryptoEvent('repository_analyzed', {
        repository: `${owner}/${repo}`,
        type: 'gas_estimation',
      });

      return analysis;
    } catch (error) {
      logger.error(`Failed to analyze repository ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async analyzeAndUpdate(owner, repo) {
    // Wrapper method for repository analysis with GitHub updates
    try {
      const analysis = await this.analyzeRepository(owner, repo);
      
      // In a real implementation, this would update the GitHub repository
      // with gas estimation results, possibly as:
      // - Issue comments
      // - PR comments
      // - Status checks
      // - Files in the repository
      
      logger.githubAction('gas_analysis_completed', owner, repo, {
        analysisType: 'gas_estimation',
        timestamp: analysis.timestamp,
      });

      return analysis;
    } catch (error) {
      logger.error(`Failed to analyze and update ${owner}/${repo}:`, error);
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
}

module.exports = new GasEstimationService(); 