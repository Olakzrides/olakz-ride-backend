import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app';
import { testDatabaseConnection, disconnectDatabase, prisma } from './config/database';
import { validateEnv } from './config';
import { initMarketplaceSocketService } from './services/socket.service';
import { WalletService } from './services/wallet.service';
import { VendorPromoService } from './services/vendor-promo.service';
import logger from './utils/logger';

const PORT = parseInt(process.env.PORT || '3006', 10);

/**
 * On startup and every 5 minutes: find any orders stuck in 'pending' for > 10 minutes
 * and cancel + refund them. This handles the case where the server restarted before
 * the in-memory setTimeout could fire.
 */
async function recoverStuckPendingOrders(): Promise<void> {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Also look for cancelled orders that were never refunded (payment_status still 'paid')
    const stuckOrders = await prisma.marketplaceOrder.findMany({
      where: {
        OR: [
          // Orders still pending after 10 minutes (setTimeout never fired)
          { status: 'pending', createdAt: { lt: tenMinutesAgo } },
          // Orders already cancelled by system but refund never processed
          { status: 'cancelled', cancelledBy: 'system', paymentStatus: 'paid', paymentMethod: 'wallet' },
        ],
      },
      select: { id: true, customerId: true, totalAmount: true, paymentStatus: true, paymentMethod: true, status: true },
    });

    if (stuckOrders.length === 0) return;

    logger.info(`Recovery: found ${stuckOrders.length} stuck pending order(s) — cancelling and refunding`);

    for (const order of stuckOrders) {
      try {
        // If still pending — cancel it first
        if (order.status === 'pending') {
          await prisma.marketplaceOrder.update({
            where: { id: order.id },
            data: {
              status: 'cancelled',
              cancellationReason: 'Order expired — vendor did not respond in time',
              cancelledBy: 'system',
              cancelledAt: new Date(),
            },
          });
          logger.info('Recovery: cancelled stuck pending order', { orderId: order.id });
        }

        // Refund if payment was collected but not yet refunded
        if (order.paymentStatus === 'paid' && order.paymentMethod === 'wallet') {
          const cashPortion  = parseFloat((order as any).walletCashPortion  ?? order.totalAmount.toString());
          const promoPortion = parseFloat((order as any).walletPromoPortion ?? '0');
          await WalletService.refundToBuckets({
            userId:        order.customerId,
            cashPortion,
            promoPortion,
            baseReference: `refund_recovery_${order.id}`,
            description:   'Refund: marketplace order expired — vendor did not respond',
          });
          await prisma.marketplaceOrder.update({
            where: { id: order.id },
            data: { paymentStatus: 'refunded' },
          });
          logger.info('Recovery: refunded customer for expired order', { orderId: order.id, customerId: order.customerId });
        }
      } catch (err: any) {
        logger.error('Recovery: failed to cancel/refund stuck order', { orderId: order.id, error: err.message });
      }
    }
  } catch (err: any) {
    logger.error('Recovery job failed', { error: err.message });
  }
}

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

    // Run recovery immediately on startup, then every 5 minutes
    await recoverStuckPendingOrders();
    setInterval(recoverStuckPendingOrders, 5 * 60 * 1000);

    // ── Vendor promo status sync ───────────────────────────────────────────
    await VendorPromoService.syncStatuses();
    setInterval(() => {
      VendorPromoService.syncStatuses().catch((err) =>
        logger.error('Promo status sync error', { error: err.message })
      );
    }, 60 * 1000);

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
