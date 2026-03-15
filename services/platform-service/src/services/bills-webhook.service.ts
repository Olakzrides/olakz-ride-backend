import crypto from 'crypto';
import logger from '../utils/logger';
import config from '../config';
import Database from '../utils/database';

const prisma = Database.getInstance();

export class BillsWebhookService {
  /**
   * Verify Flutterwave webhook signature
   */
  verifySignature(secretHash: string): boolean {
    const expectedHash = config.flutterwave.webhookSecret;
    if (!expectedHash) {
      logger.warn('FLUTTERWAVE_WEBHOOK_SECRET not set — skipping signature verification');
      return true; // allow through if not configured
    }
    return crypto.timingSafeEqual(
      Buffer.from(secretHash),
      Buffer.from(expectedHash)
    );
  }

  /**
   * Handle incoming Flutterwave webhook
   */
  async handleWebhook(payload: any): Promise<void> {
    const { event, data } = payload;

    logger.info('Flutterwave webhook received', { event, txRef: data?.tx_ref });

    if (event !== 'bill.payment') {
      logger.info('Ignoring non-bill webhook event', { event });
      return;
    }

    await this.processBillPaymentEvent(data);
  }

  /**
   * Process a bill.payment webhook event
   */
  private async processBillPaymentEvent(data: any): Promise<void> {
    const txRef: string = data?.tx_ref || data?.reference;

    if (!txRef) {
      logger.warn('Webhook missing tx_ref', { data });
      return;
    }

    const transaction = await prisma.bill_transactions.findFirst({
      where: { flw_tx_ref: txRef },
    });

    if (!transaction) {
      logger.warn('Webhook: transaction not found', { txRef });
      return;
    }

    // Already in a terminal state — skip
    if (transaction.status === 'successful' || transaction.status === 'failed') {
      logger.info('Webhook: transaction already in terminal state', {
        txRef,
        status: transaction.status,
      });
      return;
    }

    const isSuccess = data?.status === 'successful' || data?.status === 'success';

    await prisma.bill_transactions.update({
      where: { id: transaction.id },
      data: {
        status: isSuccess ? 'successful' : 'failed',
        payment_status: isSuccess ? 'successful' : 'failed',
        flw_reference: data?.flw_ref || data?.reference || transaction.flw_reference,
        flw_response: data,
        completed_at: isSuccess ? new Date() : null,
        failed_at: !isSuccess ? new Date() : null,
        error_message: !isSuccess ? (data?.processor_response || 'Payment failed') : null,
      },
    });

    logger.info('Webhook: transaction updated', {
      transactionId: transaction.id,
      txRef,
      status: isSuccess ? 'successful' : 'failed',
    });
  }
}

export default new BillsWebhookService();
