const coingecko = require('./api/coingecko');
const coindesk = require('./api/coindesk');
const arkhamIntel = require('./api/arkham-intel');
const gasEstimation = require('./monitoring/gas-estimation');
const networkMonitoring = require('./monitoring/network-monitoring');
const defiMonitoring = require('./monitoring/defi-monitoring');
const logger = require('../utils/logger');

class ApiServices {
  constructor() {
    this.coingecko = coingecko;
    this.coindesk = coindesk;
    this.arkhamIntel = arkhamIntel;
    this.gasEstimation = gasEstimation;
    this.networkMonitoring = networkMonitoring;
    this.defiMonitoring = defiMonitoring;
  }

  async getOverallStatus() {
    const services = {
      coingecko: this.coingecko,
      coindesk: this.coindesk,
      arkhamIntel: this.arkhamIntel,
      gasEstimation: this.gasEstimation,
      networkMonitoring: this.networkMonitoring,
      defiMonitoring: this.defiMonitoring,
    };

    const status = {
      timestamp: new Date().toISOString(),
      services: {},
      overall: 'healthy',
    };

    let hasErrors = false;

    for (const [name, service] of Object.entries(services)) {
      try {
        if (service.healthCheck) {
          status.services[name] = await service.healthCheck();
        } else {
          status.services[name] = { status: 'unknown' };
        }

        if (status.services[name].status === 'error') {
          hasErrors = true;
        }
      } catch (error) {
        status.services[name] = {
          status: 'error',
          error: error.message,
        };
        hasErrors = true;
      }
    }

    status.overall = hasErrors ? 'degraded' : 'healthy';
    return status;
  }

  async initializeAll() {
    const services = [
      this.coingecko,
      this.coindesk,
      this.arkhamIntel,
      this.gasEstimation,
      this.networkMonitoring,
      this.defiMonitoring,
    ];

    const initPromises = services.map(async (service) => {
      if (service.initialize) {
        try {
          await service.initialize();
          logger.info(`Service initialized: ${service.constructor.name}`);
        } catch (error) {
          logger.error(`Service initialization failed: ${service.constructor.name}`, error);
        }
      }
    });

    await Promise.all(initPromises);
    logger.info('All services initialization completed');
  }
}

const apiServices = new ApiServices();

// Export individual services for direct access
module.exports = {
  ...apiServices,
  getOverallStatus: () => apiServices.getOverallStatus(),
  initializeAll: () => apiServices.initializeAll(),
}; 