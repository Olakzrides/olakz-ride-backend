import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app';
import { testDatabaseConnection, disconnectDatabase } from './config/database';
import { validateEnv } from './config';
import { initMarketplaceSocketService } from './services/socket.service';
import logger from './utils/logger';

const PORT = parseInt(process.env.PORT || '3006', 10);

async function start() {
  try {
    validateEnv();

    const dbOk = await testDatabaseConnection();
    if (!dbOk) {
      logger.error('Database connection failed — exiting');
      process.exit(1);
    }

    const server = http.createServer(app);

    // Initialize Socket.IO
    initMarketplaceSocketService(server);

    server.listen(PORT, () => {
      logger.info(`Marketplace service running on port ${PORT}`, { env: process.env.NODE_ENV, port: PORT });
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down`);
      server.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err: any) {
    logger.error('Failed to start marketplace service:', err);
    process.exit(1);
  }
}

start();
