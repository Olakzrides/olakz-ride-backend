import { Request, Response } from 'express';
import billsService from '../services/bills.service';
import billsWebhookService from '../services/bills-webhook.service';
import logger from '../utils/logger';
import ResponseUtil from '../utils/response';

export class BillsController {
  /**
   * Get available networks
   * GET /api/bills/networks
   */
  async getNetworks(req: Request, res: Response): Promise<Response> {
    try {
      const networks = await billsService.getNetworks();

      return ResponseUtil.success(res, 'Networks fetched successfully', { networks });
    } catch (error: any) {
      logger.error('Get networks error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to fetch networks');
    }
  }

  /**
   * Purchase airtime
   * POST /api/bills/airtime/purchase
   */
  async purchaseAirtime(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { phone_number, network, amount, payment_method, card_id } = req.body;

      // Validation
      if (!phone_number || !network || !amount || !payment_method) {
        return ResponseUtil.error(res, 'Missing required fields', 400);
      }

      if (typeof amount !== 'number' || amount <= 0) {
        return ResponseUtil.error(res, 'Invalid amount', 400);
      }

      if (amount < 50 || amount > 500000) {
        return ResponseUtil.error(res, 'Amount must be between ₦50 and ₦500,000', 400);
      }

      if (!['wallet', 'card'].includes(payment_method)) {
        return ResponseUtil.error(res, 'Invalid payment method', 400);
      }

      if (payment_method === 'card' && !card_id) {
        return ResponseUtil.error(res, 'Card ID is required for card payment', 400);
      }

      // Validate phone number format (Nigerian)
      const phoneRegex = /^(\+?234|0)[789]\d{9}$/;
      if (!phoneRegex.test(phone_number.replace(/\s/g, ''))) {
        return ResponseUtil.error(res, 'Invalid Nigerian phone number', 400);
      }

      const result = await billsService.purchaseAirtime({
        userId,
        phoneNumber: phone_number,
        network,
        amount,
        paymentMethod: payment_method,
        cardId: card_id,
      });

      if (!result.success) {
        return ResponseUtil.error(res, result.message, 400);
      }

      return ResponseUtil.success(res, result.message, { transaction: result.transaction });
    } catch (error: any) {
      logger.error('Purchase airtime error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to purchase airtime');
    }
  }

  /**
   * Get data bundles for a network
   * GET /api/bills/data-bundles/:network
   */
  async getDataBundles(req: Request, res: Response): Promise<Response> {
    try {
      const { network } = req.params;
      const validityType = req.query.validity_type as string | undefined;

      if (!network) {
        return ResponseUtil.error(res, 'Network is required', 400);
      }

      if (validityType && !['daily', 'weekly', 'monthly', 'yearly', 'one-time'].includes(validityType)) {
        return ResponseUtil.error(res, 'Invalid validity_type', 400);
      }

      const result = await billsService.getDataBundles(network, validityType);

      return ResponseUtil.success(res, 'Data bundles fetched successfully', result);
    } catch (error: any) {
      logger.error('Get data bundles error:', error);
      if (error.message.includes('Invalid') || error.message.includes('does not support')) {
        return ResponseUtil.error(res, error.message, 400);
      }
      return ResponseUtil.serverError(res, error.message || 'Failed to fetch data bundles');
    }
  }

  /**
   * Purchase data bundle
   * POST /api/bills/data/purchase
   */
  async purchaseData(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { phone_number, network, bundle_code, payment_method, card_id } = req.body;

      if (!phone_number || !network || !bundle_code || !payment_method) {
        return ResponseUtil.error(res, 'Missing required fields', 400);
      }

      if (!['wallet', 'card'].includes(payment_method)) {
        return ResponseUtil.error(res, 'Invalid payment method', 400);
      }

      if (payment_method === 'card' && !card_id) {
        return ResponseUtil.error(res, 'Card ID is required for card payment', 400);
      }

      const phoneRegex = /^(\+?234|0)[789]\d{9}$/;
      if (!phoneRegex.test(phone_number.replace(/\s/g, ''))) {
        return ResponseUtil.error(res, 'Invalid Nigerian phone number', 400);
      }

      const result = await billsService.purchaseData({
        userId,
        phoneNumber: phone_number,
        network,
        bundleCode: bundle_code,
        paymentMethod: payment_method,
        cardId: card_id,
      });

      if (!result.success) {
        return ResponseUtil.error(res, result.message, 400);
      }

      return ResponseUtil.success(res, result.message, { transaction: result.transaction });
    } catch (error: any) {
      logger.error('Purchase data error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to purchase data bundle');
    }
  }

  /**
   * Refresh data bundle cache for a network (admin)
   * POST /api/bills/data-bundles/refresh
   */
  async refreshDataCache(req: Request, res: Response): Promise<Response> {
    try {
      const { network } = req.body;

      if (!network) {
        return ResponseUtil.error(res, 'Network is required', 400);
      }

      // getDataBundles will sync if needed; force sync by calling syncDataBundlesFromFlutterwave
      // We re-use getDataBundles which handles network validation
      await billsService.getDataBundles(network, undefined);

      return ResponseUtil.success(res, 'Data bundle cache refreshed successfully', {});
    } catch (error: any) {
      logger.error('Refresh data cache error:', error);
      if (error.message.includes('Invalid') || error.message.includes('does not support')) {
        return ResponseUtil.error(res, error.message, 400);
      }
      return ResponseUtil.serverError(res, error.message || 'Failed to refresh data cache');
    }
  }

  /**
   * Get transaction history
   * GET /api/bills/transactions
   */
  async getTransactionHistory(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const type = req.query.type as 'airtime' | 'data' | undefined;

      if (page < 1 || limit < 1 || limit > 100) {
        return ResponseUtil.error(res, 'Invalid pagination parameters', 400);
      }

      if (type && !['airtime', 'data'].includes(type)) {
        return ResponseUtil.error(res, 'Invalid transaction type', 400);
      }

      const result = await billsService.getTransactionHistory(userId, page, limit, type);

      return ResponseUtil.success(res, 'Transaction history fetched successfully', {
        transactions: result.transactions,
        pagination: {
          page,
          limit,
          total: result.total,
          total_pages: Math.ceil(result.total / limit),
        },
      });
    } catch (error: any) {
      logger.error('Get transaction history error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to fetch transaction history');
    }
  }

  /**
   * Get single transaction
   * GET /api/bills/transaction/:id
   */
  async getTransaction(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      if (!id) {
        return ResponseUtil.error(res, 'Transaction ID is required', 400);
      }

      const transaction = await billsService.getTransaction(id, userId);

      return ResponseUtil.success(res, 'Transaction fetched successfully', { transaction });
    } catch (error: any) {
      logger.error('Get transaction error:', error);
      if (error.message === 'Transaction not found') {
        return ResponseUtil.notFound(res, 'Transaction');
      }
      return ResponseUtil.serverError(res, error.message || 'Failed to fetch transaction');
    }
  }
  /**
   * Flutterwave webhook handler
   * POST /api/bills/webhook
   */
  async handleWebhook(req: Request, res: Response): Promise<Response> {
    try {
      const secretHash = req.headers['verif-hash'] as string;

      if (!billsWebhookService.verifySignature(secretHash || '')) {
        logger.warn('Webhook: invalid signature');
        return ResponseUtil.error(res, 'Invalid webhook signature', 401, 'UNAUTHORIZED');
      }

      // Respond immediately — process async
      res.status(200).json({ success: true, message: 'Webhook received' });

      billsWebhookService.handleWebhook(req.body).catch((err: any) => {
        logger.error('Webhook processing error', { error: err.message });
      });

      return res;
    } catch (error: any) {
      logger.error('Webhook handler error:', error);
      return ResponseUtil.serverError(res, 'Webhook processing failed');
    }
  }

  /**
   * Retry a failed transaction
   * POST /api/bills/transaction/:id/retry
   */
  async retryTransaction(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const { id } = req.params;
      if (!id) return ResponseUtil.error(res, 'Transaction ID is required', 400);

      const result = await billsService.retryTransaction(id, userId);

      return ResponseUtil.success(
        res,
        result.success ? 'Transaction retry successful' : 'Transaction retry failed',
        { transaction: result.transaction }
      );
    } catch (error: any) {
      logger.error('Retry transaction error:', error);
      if (
        error.message === 'Transaction not found' ||
        error.message.includes('Only failed') ||
        error.message.includes('Maximum retry')
      ) {
        return ResponseUtil.error(res, error.message, 400);
      }
      return ResponseUtil.serverError(res, error.message || 'Failed to retry transaction');
    }
  }

  /**
   * Get transaction receipt
   * GET /api/bills/transaction/:id/receipt
   */
  async getTransactionReceipt(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const { id } = req.params;
      if (!id) return ResponseUtil.error(res, 'Transaction ID is required', 400);

      const receipt = await billsService.getTransactionReceipt(id, userId);

      return ResponseUtil.success(res, 'Receipt fetched successfully', { receipt });
    } catch (error: any) {
      logger.error('Get receipt error:', error);
      if (error.message === 'Transaction not found') return ResponseUtil.notFound(res, 'Transaction');
      if (error.message.includes('Receipt only available')) return ResponseUtil.error(res, error.message, 400);
      return ResponseUtil.serverError(res, error.message || 'Failed to fetch receipt');
    }
  }
}

export default new BillsController();
