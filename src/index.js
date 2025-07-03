require('dotenv').config();
const express = require('express');
const { App } = require('@octokit/app');
const logger = require('./utils/logger');
const config = require('./config');
const webhookHandler = require('./webhooks/handler');
const scheduledTasks = require('./services/scheduler');
const apiServices = require('./services');

class CryptoIntelBot {
  constructor() {
    this.app = express();
    this.githubApp = new App({
      appId: config.github.appId,
      privateKey: config.github.privateKey,
      webhooks: {
        secret: config.github.webhookSecret,
      },
    });
    
    this.setupMiddleware();
    this.setupWebhooks();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });
  }

  setupWebhooks() {
    // GitHub webhook handling
    this.app.post('/webhooks/github', async (req, res) => {
      try {
        await webhookHandler.handle(req, res, this.githubApp);
      } catch (error) {
        logger.error('Webhook handling error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: require('../package.json').version,
      });
    });

    // API status endpoint
    this.app.get('/api/status', async (req, res) => {
      try {
        const status = await this.getApiStatus();
        res.json(status);
      } catch (error) {
        logger.error('Status check error:', error);
        res.status(500).json({ error: 'Failed to get status' });
      }
    });

    // Manual trigger endpoints for testing
    this.app.post('/api/trigger/gas-analysis', async (req, res) => {
      try {
        const { owner, repo } = req.body;
        await apiServices.gasEstimation.analyzeAndUpdate(owner, repo);
        res.json({ message: 'Gas analysis triggered successfully' });
      } catch (error) {
        logger.error('Gas analysis trigger error:', error);
        res.status(500).json({ error: 'Failed to trigger gas analysis' });
      }
    });

    this.app.post('/api/trigger/network-monitor', async (req, res) => {
      try {
        const { owner, repo } = req.body;
        await apiServices.networkMonitoring.updateDeployments(owner, repo);
        res.json({ message: 'Network monitoring triggered successfully' });
      } catch (error) {
        logger.error('Network monitoring trigger error:', error);
        res.status(500).json({ error: 'Failed to trigger network monitoring' });
      }
    });
  }

  async getApiStatus() {
    const services = [
      'coingecko',
      'coindesk',
      'arkhamIntel',
      'gasEstimation',
      'networkMonitoring',
      'defiMonitoring',
    ];

    const status = {
      timestamp: new Date().toISOString(),
      services: {},
    };

    for (const service of services) {
      try {
        if (apiServices[service] && apiServices[service].healthCheck) {
          status.services[service] = await apiServices[service].healthCheck();
        } else {
          status.services[service] = { status: 'unknown' };
        }
      } catch (error) {
        status.services[service] = {
          status: 'error',
          error: error.message,
        };
      }
    }

    return status;
  }

  async start() {
    try {
      // Initialize services
      await this.initializeServices();

      // Start scheduled tasks
      scheduledTasks.start();

      // Start server
      const port = config.server.port;
      this.app.listen(port, () => {
        logger.info(`Crypto Intel GitHub Bot started on port ${port}`, {
          environment: config.server.nodeEnv,
          githubAppId: config.github.appId,
        });
      });
    } catch (error) {
      logger.error('Failed to start application:', error);
      process.exit(1);
    }
  }

  async initializeServices() {
    logger.info('Initializing API services...');
    
    // Initialize all API services
    const serviceInitPromises = Object.values(apiServices).map(async (service) => {
      if (service.initialize) {
        try {
          await service.initialize();
          logger.info(`Initialized service: ${service.constructor.name}`);
        } catch (error) {
          logger.error(`Failed to initialize service ${service.constructor.name}:`, error);
        }
      }
    });

    await Promise.all(serviceInitPromises);
    logger.info('All services initialized');
  }

  async shutdown() {
    logger.info('Shutting down application...');
    
    // Stop scheduled tasks
    scheduledTasks.stop();
    
    // Graceful shutdown logic here
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  if (global.botInstance) {
    await global.botInstance.shutdown();
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  if (global.botInstance) {
    await global.botInstance.shutdown();
  }
});

// Start the application
if (require.main === module) {
  const bot = new CryptoIntelBot();
  global.botInstance = bot;
  bot.start();
}

module.exports = CryptoIntelBot; 