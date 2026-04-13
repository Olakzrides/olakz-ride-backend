import { Request, Response } from 'express';
import axios from 'axios';
import { PaymentService } from '../services/payment.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';
import { config } from '../config/env';

/**
 * WalletController — Phase 3 migration
 *
 * User-facing endpoints (topup, balance, transactions) delegate to payment-service.
 * Internal endpoints (/api/wallet/internal/*) are kept as thin proxies to
 * payment-service so existing callers (platform-service, etc.) keep working
 * without any changes on their side.
 */
export class WalletController {
  private paymentService: PaymentService;
  private internalApiKey: string;

  constructor() {
    this.paymentService = new PaymentService();
    this.internalApiKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';
  }

  // ─── Helper: proxy a request to payment-service internal API ────────────────

  private async proxyToPaymentService(
    method: 'get' | 'post',
    path: string,
    userId: string,
    body?: any,
    query?: any
  ): Promise<{ status: number; data: any }> {
    const response = await axios({
      method,
      url: `${config.paymentServiceUrl}${path}`,
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': this.internalApiKey,
        'x-user-id': userId,
      },
      params: query,
      data: body,
      timeout: 30000,
    });
    return { status: response.status, data: response.data };
  }

  // ─── User-facing endpoints ───────────────────────────────────────────────────

  /**
   * POST /api/wallet/topup
   */
  topupWallet = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userEmail = (req as any).user?.email;

      if (!userId || !userEmail) return ResponseUtil.unauthorized(res);

      const { amount, currencyCode = 'NGN', cardId, cardDetails } = req.body;

      if (!amount || amount <= 0) return ResponseUtil.badRequest(res, 'Invalid amount');
      if (amount < 100) return ResponseUtil.badRequest(res, 'Minimum top-up amount is ₦100');
      if (amount > 500000) return ResponseUtil.badRequest(res, 'Maximum top-up amount is ₦500,000');
      if (!cardId && !cardDetails) return ResponseUtil.badRequest(res, 'Either cardId or cardDetails is required');

      const result = await this.paymentService.topupWallet({ userId, userEmail, amount, currencyCode, cardId, cardDetails });

      if (!result.success) return ResponseUtil.badRequest(res, result.message || 'Top-up failed');

      if (result.requiresAuthorization) {
        return ResponseUtil.success(res, {
          status: 'pending_authorization',
          message: 'Please validate the charge with OTP',
          authorization: result.authorization,
          flw_ref: result.flw_ref,
          tx_ref: result.tx_ref,
          amount,
          currency_code: currencyCode,
        });
      }

      return ResponseUtil.success(res, {
        message: 'Wallet top-up successful',
        transaction: result.transaction,
        wallet: { balance: result.newBalance, currency_code: currencyCode },
      });
    } catch (error: any) {
      logger.error('Wallet top-up error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to top up wallet');
    }
  };

  /**
   * POST /api/wallet/topup/validate
   */
  validateTopup = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const { flwRef, otp, amount, currencyCode = 'NGN' } = req.body;
      if (!flwRef || !otp) return ResponseUtil.badRequest(res, 'flwRef and otp are required');
      if (!amount) return ResponseUtil.badRequest(res, 'amount is required');

      const result = await this.paymentService.validateTopup({ userId, flwRef, otp, amount, currencyCode });

      if (!result.success) return ResponseUtil.badRequest(res, result.message || 'Validation failed');

      return ResponseUtil.success(res, {
        message: 'Wallet top-up successful',
        transaction: result.transaction,
        wallet: { balance: result.newBalance, currency_code: currencyCode },
      });
    } catch (error: any) {
      logger.error('Validate top-up error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to validate top-up');
    }
  };

  /**
   * GET /api/wallet/balance
   */
  getWalletBalance = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const currencyCode = (req.query.currency as string) || 'NGN';
      const balance = await this.paymentService.getUserWalletBalance(userId, currencyCode);

      return ResponseUtil.success(res, { wallet: { balance, currency_code: currencyCode } });
    } catch (error: any) {
      logger.error('Get wallet balance error:', error);
      return ResponseUtil.error(res, 'Failed to get wallet balance');
    }
  };

  /**
   * GET /api/wallet/transactions
   */
  getTransactionHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.paymentService.getUserTransactions(userId, page, limit);

      return ResponseUtil.success(res, {
        transactions: result.transactions,
        pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
      });
    } catch (error: any) {
      logger.error('Get transaction history error:', error);
      return ResponseUtil.error(res, 'Failed to get transaction history');
    }
  };

  // ─── Internal API endpoints (thin proxies to payment-service) ───────────────
  // These are kept so existing callers (platform-service etc.) don't break.

  /**
   * GET /api/wallet/internal/balance
   */
  getWalletBalanceInternal = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return ResponseUtil.badRequest(res, 'X-User-Id header is required');

      const { status, data } = await this.proxyToPaymentService(
        'get',
        '/api/internal/payment/wallet/balance',
        userId,
        undefined,
        { currency: req.query.currency || 'NGN' }
      );

      return res.status(status).json(data);
    } catch (error: any) {
      logger.error('Get wallet balance (internal proxy) error:', error.response?.data || error.message);
      return ResponseUtil.error(res, 'Failed to get wallet balance');
    }
  };

  /**
   * POST /api/wallet/internal/credit
   */
  creditWalletInternal = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return ResponseUtil.badRequest(res, 'X-User-Id header is required');

      const { status, data } = await this.proxyToPaymentService(
        'post',
        '/api/internal/payment/wallet/credit',
        userId,
        req.body
      );

      return res.status(status).json(data);
    } catch (error: any) {
      logger.error('Credit wallet (internal proxy) error:', error.response?.data || error.message);
      return ResponseUtil.error(res, 'Failed to credit wallet');
    }
  };

  /**
   * POST /api/wallet/internal/deduct
   */
  deductFromWalletInternal = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return ResponseUtil.badRequest(res, 'X-User-Id header is required');

      const { status, data } = await this.proxyToPaymentService(
        'post',
        '/api/internal/payment/wallet/deduct',
        userId,
        req.body
      );

      return res.status(status).json(data);
    } catch (error: any) {
      logger.error('Deduct wallet (internal proxy) error:', error.response?.data || error.message);
      return ResponseUtil.error(res, 'Failed to deduct from wallet');
    }
  };

  /**
   * POST /api/wallet/add-test-funds  (testing only)
   */
  addTestFunds = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const { amount, currencyCode = 'NGN' } = req.body;
      if (!amount || amount <= 0) return ResponseUtil.badRequest(res, 'Invalid amount');
      if (amount > 50000) return ResponseUtil.badRequest(res, 'Maximum test amount is ₦50,000');

      // Credit via payment-service internal API
      const reference = `test_fund_${Date.now()}_${userId}`;
      const { status, data } = await this.proxyToPaymentService(
        'post',
        '/api/internal/payment/wallet/credit',
        userId,
        {
          amount,
          currency_code: currencyCode,
          reference,
          description: 'Test funds added to wallet',
          transaction_type: 'credit',
        }
      );

      return res.status(status).json(data);
    } catch (error: any) {
      logger.error('Add test funds error:', error.response?.data || error.message);
      return ResponseUtil.error(res, 'Failed to add test funds');
    }
  };
}
