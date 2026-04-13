import app from './app';
import config from './config';
import logger from './utils/logger';

const server = app.listen(config.port, () => {
  logger.info(`Payment service running on port ${config.port}`, {
    env: config.env,
    port: config.port,
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

export default server;
