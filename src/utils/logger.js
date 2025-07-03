const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.filePath);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'crypto-intel-bot' },
  transports: [
    // File transport
    new winston.transports.File({
      filename: config.logging.filePath,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
    
    // Error file transport
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

// Add console transport for development
if (config.server.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Add helper methods for structured logging
logger.apiCall = (service, endpoint, duration, statusCode, metadata = {}) => {
  logger.info('API call completed', {
    type: 'api_call',
    service,
    endpoint,
    duration,
    statusCode,
    ...metadata,
  });
};

logger.githubAction = (action, owner, repo, metadata = {}) => {
  logger.info(`GitHub action: ${action}`, {
    type: 'github_action',
    action,
    owner,
    repo,
    ...metadata,
  });
};

logger.cryptoEvent = (eventType, data, metadata = {}) => {
  logger.info(`Crypto event: ${eventType}`, {
    type: 'crypto_event',
    eventType,
    data,
    ...metadata,
  });
};

logger.performance = (operation, duration, metadata = {}) => {
  logger.info(`Performance: ${operation}`, {
    type: 'performance',
    operation,
    duration,
    ...metadata,
  });
};

module.exports = logger; 