import 'dotenv/config';
import app from './app';
import config from './config';
import { logger } from './utils/logger';
import { DailyReportService } from './services/daily-report.service';

const server = app.listen(config.port, () => {
  logger.info(`Admin service running on port ${config.port}`, {
    env:  config.env,
    port: config.port,
  });

  // ── Daily report cleanup watchdog ──────────────────────────────────────────
  // Purge reports older than 6 months. Runs once on startup then every 24 h.
  const runCleanup = async () => {
    try {
      const deleted = await DailyReportService.purgeOldReports();
      if (deleted > 0) {
        logger.info(`Daily report cleanup: removed ${deleted} reports older than 6 months`);
      }
    } catch (err: any) {
      logger.warn('Daily report cleanup failed (non-fatal)', { error: err?.message });
    }
  };

  runCleanup(); // run immediately on startup
  setInterval(runCleanup, 24 * 60 * 60 * 1000); // then every 24 hours
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
