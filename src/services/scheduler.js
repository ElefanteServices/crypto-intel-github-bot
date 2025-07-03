const cron = require('node-cron');
const logger = require('../utils/logger');
const config = require('../config');
const apiServices = require('./index');

class ScheduledTasks {
  constructor() {
    this.tasks = new Map();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      logger.warn('Scheduled tasks already running');
      return;
    }

    logger.info('Starting scheduled tasks...');
    
    // Gas price monitoring - every 5 minutes
    this.addTask('gas-monitoring', '*/5 * * * *', async () => {
      try {
        await apiServices.gasEstimation.updateGasPrices();
        logger.info('Gas price monitoring completed');
      } catch (error) {
        logger.error('Gas price monitoring failed:', error);
      }
    });

    // Market data updates - every 15 minutes
    this.addTask('market-data', '*/15 * * * *', async () => {
      try {
        await this.updateMarketData();
        logger.info('Market data update completed');
      } catch (error) {
        logger.error('Market data update failed:', error);
      }
    });

    // DeFi protocol monitoring - every 30 minutes
    this.addTask('defi-monitoring', `*/${config.monitoring.updateIntervalMinutes} * * * *`, async () => {
      try {
        await apiServices.defiMonitoring.updateAllProtocols();
        logger.info('DeFi monitoring completed');
      } catch (error) {
        logger.error('DeFi monitoring failed:', error);
      }
    });

    // Network deployment monitoring - every hour
    this.addTask('network-monitoring', '0 * * * *', async () => {
      try {
        await apiServices.networkMonitoring.scanAllNetworks();
        logger.info('Network monitoring completed');
      } catch (error) {
        logger.error('Network monitoring failed:', error);
      }
    });

    // Health check - every 10 minutes
    this.addTask('health-check', '*/10 * * * *', async () => {
      try {
        const status = await apiServices.getOverallStatus();
        logger.info('Health check completed', { status: status.overall });
        
        // Log any service issues
        Object.entries(status.services).forEach(([name, serviceStatus]) => {
          if (serviceStatus.status === 'error') {
            logger.warn(`Service ${name} is unhealthy:`, serviceStatus.error);
          }
        });
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    });

    this.isRunning = true;
    logger.info(`Started ${this.tasks.size} scheduled tasks`);
  }

  stop() {
    if (!this.isRunning) {
      logger.warn('Scheduled tasks not running');
      return;
    }

    logger.info('Stopping scheduled tasks...');
    
    this.tasks.forEach((task, name) => {
      task.stop();
      logger.info(`Stopped task: ${name}`);
    });

    this.tasks.clear();
    this.isRunning = false;
    logger.info('All scheduled tasks stopped');
  }

  addTask(name, schedule, taskFunction) {
    if (this.tasks.has(name)) {
      logger.warn(`Task ${name} already exists, replacing...`);
      this.tasks.get(name).stop();
    }

    const task = cron.schedule(schedule, async () => {
      const startTime = Date.now();
      logger.info(`Starting scheduled task: ${name}`);
      
      try {
        await taskFunction();
        const duration = Date.now() - startTime;
        logger.performance(`Task ${name}`, duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`Task ${name} failed after ${duration}ms:`, error);
      }
    }, {
      scheduled: this.isRunning,
    });

    this.tasks.set(name, task);
    logger.info(`Added scheduled task: ${name} (${schedule})`);
  }

  async updateMarketData() {
    // Update price data from multiple sources
    const promises = [
      apiServices.coingecko.updateTopCryptos(),
      apiServices.coindesk.updateBitcoinData(),
    ];

    await Promise.allSettled(promises);
  }

  getTaskStatus() {
    const status = {
      isRunning: this.isRunning,
      taskCount: this.tasks.size,
      tasks: {},
    };

    this.tasks.forEach((task, name) => {
      status.tasks[name] = {
        running: task.running,
        scheduled: task.scheduled,
      };
    });

    return status;
  }
}

module.exports = new ScheduledTasks(); 