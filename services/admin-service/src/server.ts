import 'dotenv/config';
import app from './app';
import config from './config';
import { logger } from './utils/logger';

const server = app.listen(config.port, () => {
  logger.info(`Admin service running on port ${config.port}`, {
    env: config.env,
    port: config.port,
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('Admin service stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully');
  server.close(() => {
    logger.info('Admin service stopped');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});

export default server;
