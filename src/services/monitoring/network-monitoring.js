const { ethers } = require('ethers');
const axios = require('axios');
const logger = require('../../utils/logger');
const config = require('../../config');

class NetworkMonitoringService {
  constructor() {
    this.providers = {};
    this.scannerApis = {};
    this.cache = new Map();
    this.monitoredRepositories = new Set();
    this.initializeProviders();
    this.initializeScannerApis();
  }

  initializeProviders() {
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

  initializeScannerApis() {
    // Initialize blockchain scanner APIs
    this.scannerApis = {
      ethereum: {
        baseUrl: config.apis.etherscan.baseUrl,
        apiKey: config.apis.etherscan.apiKey,
      },
      polygon: {
        baseUrl: config.apis.polygonscan.baseUrl,
        apiKey: config.apis.polygonscan.apiKey,
      },
      arbitrum: {
        baseUrl: config.apis.arbiscan.baseUrl,
        apiKey: config.apis.arbiscan.apiKey,
      },
    };
  }

  async initialize() {
    try {
      await this.healthCheck();
      logger.info('Network monitoring service initialized successfully');
    } catch (error) {
      logger.error('Network monitoring service initialization failed:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const networkStatuses = {};
      let healthyCount = 0;

      for (const [networkName, provider] of Object.entries(this.providers)) {
        try {
          const [blockNumber, network] = await Promise.all([
            provider.getBlockNumber(),
            provider.getNetwork(),
          ]);

          networkStatuses[networkName] = {
            status: 'healthy',
            blockNumber,
            chainId: network.chainId.toString(),
          };
          healthyCount++;
        } catch (error) {
          networkStatuses[networkName] = {
            status: 'error',
            error: error.message,
          };
        }
      }

      return {
        status: healthyCount > 0 ? 'healthy' : 'error',
        networks: networkStatuses,
        monitoredRepos: this.monitoredRepositories.size,
        healthyNetworks: healthyCount,
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  async scanContractDeployments(network, fromBlock = 'latest', toBlock = 'latest') {
    try {
      const provider = this.providers[network];
      if (!provider) {
        throw new Error(`Provider not available for network: ${network}`);
      }

      // Get recent blocks to scan for contract deployments
      let startBlock, endBlock;
      
      if (fromBlock === 'latest') {
        endBlock = await provider.getBlockNumber();
        startBlock = Math.max(0, endBlock - 100); // Scan last 100 blocks
      } else {
        startBlock = parseInt(fromBlock);
        endBlock = toBlock === 'latest' ? await provider.getBlockNumber() : parseInt(toBlock);
      }

      const deployments = [];
      
      // Scan blocks for contract creation transactions
      for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
        try {
          const block = await provider.getBlock(blockNum, true);
          
          if (block && block.transactions) {
            for (const tx of block.transactions) {
              // Contract creation transactions have no 'to' field
              if (!tx.to && tx.creates) {
                const deployment = await this.analyzeContractDeployment(tx, network);
                if (deployment) {
                  deployments.push(deployment);
                }
              }
            }
          }
        } catch (error) {
          logger.warn(`Failed to scan block ${blockNum} on ${network}:`, error);
        }
      }

      logger.cryptoEvent('contract_deployments_scanned', {
        network,
        blocksScanned: endBlock - startBlock + 1,
        deploymentsFound: deployments.length,
      });

      return {
        network,
        fromBlock: startBlock,
        toBlock: endBlock,
        deployments,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Failed to scan contract deployments on ${network}:`, error);
      throw error;
    }
  }

  async analyzeContractDeployment(transaction, network) {
    try {
      const provider = this.providers[network];
      const receipt = await provider.getTransactionReceipt(transaction.hash);
      
      if (!receipt || !receipt.contractAddress) {
        return null;
      }

      // Get contract code to verify it's actually a contract
      const code = await provider.getCode(receipt.contractAddress);
      if (code === '0x') {
        return null; // Not a contract or self-destructed
      }

      const deployment = {
        transactionHash: transaction.hash,
        contractAddress: receipt.contractAddress,
        deployer: transaction.from,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: transaction.gasPrice ? transaction.gasPrice.toString() : null,
        deploymentCost: null,
        network,
        codeSize: (code.length - 2) / 2, // Convert hex to bytes
        timestamp: new Date().toISOString(),
      };

      // Calculate deployment cost
      if (transaction.gasPrice) {
        const costWei = receipt.gasUsed * transaction.gasPrice;
        deployment.deploymentCost = {
          wei: costWei.toString(),
          eth: ethers.formatEther(costWei),
        };
      }

      // Try to get contract source code from scanner API
      const sourceInfo = await this.getContractSourceCode(receipt.contractAddress, network);
      if (sourceInfo) {
        deployment.sourceCode = sourceInfo;
      }

      return deployment;
    } catch (error) {
      logger.error(`Failed to analyze contract deployment ${transaction.hash}:`, error);
      return null;
    }
  }

  async getContractSourceCode(contractAddress, network) {
    try {
      const scannerApi = this.scannerApis[network];
      if (!scannerApi || !scannerApi.apiKey) {
        return null;
      }

      const response = await axios.get(scannerApi.baseUrl, {
        params: {
          module: 'contract',
          action: 'getsourcecode',
          address: contractAddress,
          apikey: scannerApi.apiKey,
        },
        timeout: 10000,
      });

      const result = response.data.result?.[0];
      if (result && result.SourceCode) {
        return {
          contractName: result.ContractName,
          compilerVersion: result.CompilerVersion,
          optimizationUsed: result.OptimizationUsed === '1',
          sourceCode: result.SourceCode.length > 1000 ? 
            result.SourceCode.substring(0, 1000) + '...' : result.SourceCode,
          abi: result.ABI ? JSON.parse(result.ABI) : null,
        };
      }

      return null;
    } catch (error) {
      logger.debug(`Failed to get source code for ${contractAddress} on ${network}:`, error);
      return null;
    }
  }

  async scanAllNetworks() {
    try {
      const scanPromises = Object.keys(this.providers).map(async (network) => {
        try {
          return await this.scanContractDeployments(network);
        } catch (error) {
          logger.error(`Failed to scan ${network}:`, error);
          return {
            network,
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      });

      const results = await Promise.allSettled(scanPromises);
      
      const scanResults = results.map((result) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            error: result.reason.message,
            timestamp: new Date().toISOString(),
          };
        }
      });

      // Analyze deployment trends
      const analysis = this.analyzeDeploymentTrends(scanResults);
      
      logger.cryptoEvent('network_scan_completed', {
        networksScanned: scanResults.length,
        totalDeployments: analysis.totalDeployments,
        activeNetworks: analysis.activeNetworks.length,
      });

      return {
        scanResults,
        analysis,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to scan all networks:', error);
      throw error;
    }
  }

  analyzeDeploymentTrends(scanResults) {
    const analysis = {
      totalDeployments: 0,
      activeNetworks: [],
      deploymentsByNetwork: {},
      alerts: [],
      summary: {
        averageGasUsed: 0,
        totalDeploymentCost: 0,
        mostActiveNetwork: null,
      },
    };

    let totalGasUsed = 0;
    let gasUsedCount = 0;

    for (const result of scanResults) {
      if (result.error || !result.deployments) continue;

      const deploymentCount = result.deployments.length;
      analysis.totalDeployments += deploymentCount;
      analysis.deploymentsByNetwork[result.network] = deploymentCount;

      if (deploymentCount > 0) {
        analysis.activeNetworks.push(result.network);

        // Calculate gas statistics
        for (const deployment of result.deployments) {
          if (deployment.gasUsed) {
            totalGasUsed += parseInt(deployment.gasUsed);
            gasUsedCount++;
          }
        }

        // Generate alerts for high deployment activity
        if (deploymentCount > 20) {
          analysis.alerts.push({
            type: 'high_deployment_activity',
            network: result.network,
            message: `High deployment activity on ${result.network}: ${deploymentCount} contracts deployed`,
            severity: deploymentCount > 50 ? 'high' : 'medium',
          });
        }
      }
    }

    // Calculate summary statistics
    if (gasUsedCount > 0) {
      analysis.summary.averageGasUsed = totalGasUsed / gasUsedCount;
    }

    // Find most active network
    const maxDeployments = Math.max(...Object.values(analysis.deploymentsByNetwork));
    analysis.summary.mostActiveNetwork = Object.entries(analysis.deploymentsByNetwork)
      .find(([network, count]) => count === maxDeployments)?.[0];

    return analysis;
  }

  async trackContractActivity(contractAddress, network) {
    try {
      const provider = this.providers[network];
      if (!provider) {
        throw new Error(`Provider not available for network: ${network}`);
      }

      // Get recent transactions to the contract
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 1000); // Last 1000 blocks

      const logs = await provider.getLogs({
        address: contractAddress,
        fromBlock,
        toBlock: 'latest',
      });

      const activity = {
        contractAddress,
        network,
        fromBlock,
        toBlock: latestBlock,
        eventCount: logs.length,
        events: logs.slice(0, 10), // Last 10 events
        timestamp: new Date().toISOString(),
      };

      return activity;
    } catch (error) {
      logger.error(`Failed to track contract activity for ${contractAddress}:`, error);
      throw error;
    }
  }

  async initializeRepository(owner, repo) {
    try {
      const repoKey = `${owner}/${repo}`;
      this.monitoredRepositories.add(repoKey);
      
      logger.githubAction('repository_monitoring_initialized', owner, repo, {
        monitoringType: 'network_deployments',
      });

      // In a real implementation, this would:
      // 1. Scan repository for deployment scripts
      // 2. Extract contract addresses from deployment artifacts
      // 3. Set up monitoring for those contracts
      // 4. Create initial monitoring report

      return {
        repository: repoKey,
        initialized: true,
        timestamp: new Date().toISOString(),
        monitoring: [
          'contract_deployments',
          'transaction_activity',
          'gas_usage_trends',
        ],
      };
    } catch (error) {
      logger.error(`Failed to initialize repository monitoring for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async updateDeployments(owner, repo) {
    try {
      const repoKey = `${owner}/${repo}`;
      
      // Scan all networks for recent deployments
      const scanResults = await this.scanAllNetworks();
      
      // Filter deployments that might be related to this repository
      // In a real implementation, this would be more sophisticated
      const relevantDeployments = this.filterDeploymentsForRepository(scanResults, owner, repo);
      
      logger.githubAction('deployments_updated', owner, repo, {
        deploymentsFound: relevantDeployments.length,
        networksScanned: scanResults.scanResults.length,
      });

      return {
        repository: repoKey,
        scanResults,
        relevantDeployments,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Failed to update deployments for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  filterDeploymentsForRepository(scanResults, owner, repo) {
    // This is a placeholder implementation
    // In reality, you would:
    // 1. Match deployments to known contract addresses from the repo
    // 2. Use deployer address patterns
    // 3. Match contract bytecode with compiled artifacts
    // 4. Use deployment transaction patterns

    const allDeployments = [];
    
    for (const result of scanResults.scanResults) {
      if (result.deployments) {
        allDeployments.push(...result.deployments);
      }
    }

    // For now, return recent deployments as potentially relevant
    return allDeployments.slice(0, 5);
  }

  async getNetworkStatus(network) {
    try {
      const provider = this.providers[network];
      if (!provider) {
        throw new Error(`Provider not available for network: ${network}`);
      }

      const [blockNumber, gasPrice, network_info] = await Promise.all([
        provider.getBlockNumber(),
        provider.getFeeData(),
        provider.getNetwork(),
      ]);

      return {
        network,
        blockNumber,
        chainId: network_info.chainId.toString(),
        gasPrice: gasPrice.gasPrice ? ethers.formatUnits(gasPrice.gasPrice, 'gwei') : null,
        maxFeePerGas: gasPrice.maxFeePerGas ? ethers.formatUnits(gasPrice.maxFeePerGas, 'gwei') : null,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Failed to get network status for ${network}:`, error);
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

module.exports = new NetworkMonitoringService(); 