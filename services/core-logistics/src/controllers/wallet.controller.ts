import { Request, Response } from 'express';
import { PaymentService } from '../services/payment.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';
import { supabase } from '../config/database';

export class WalletController {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

  /**
   * Top up wallet using saved card or new card (Step 1: Initiate)
   * POST /api/wallet/topup
   */
  topupWallet = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userEmail = (req as any).user?.email;
      
      if (!userId || !userEmail) {
        return ResponseUtil.unauthorized(res);
      }

      const { amount, currencyCode = 'NGN', cardId, cardDetails } = req.body;

      // Validate amount
      if (!amount || amount <= 0) {
        return ResponseUtil.badRequest(res, 'Invalid amount');
      }

      if (amount < 100) {
        return ResponseUtil.badRequest(res, 'Minimum top-up amount is ₦100');
      }

      if (amount > 500000) {
        return ResponseUtil.badRequest(res, 'Maximum top-up amount is ₦500,000');
      }

      // Must provide either cardId or cardDetails
      if (!cardId && !cardDetails) {
        return ResponseUtil.badRequest(res, 'Either cardId or cardDetails is required');
      }

      const result = await this.paymentService.topupWallet({
        userId,
        userEmail,
        amount,
        currencyCode,
        cardId,
        cardDetails,
      });

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.message || 'Top-up failed');
      }

      // Check if authorization is required
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
        wallet: {
          balance: result.newBalance,
          currency_code: currencyCode,
        },
      });
    } catch (error: any) {
      logger.error('Wallet top-up error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to top up wallet');
    }
  };

  /**
   * Validate wallet top-up with OTP (Step 2: Complete)
   * POST /api/wallet/topup/validate
   */
  validateTopup = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userEmail = (req as any).user?.email;

      if (!userId || !userEmail) {
        return ResponseUtil.unauthorized(res);
      }

      const { flwRef, otp, amount, currencyCode = 'NGN' } = req.body;

      if (!flwRef || !otp) {
        return ResponseUtil.badRequest(res, 'flwRef and otp are required');
      }

      if (!amount) {
        return ResponseUtil.badRequest(res, 'amount is required');
      }

      const result = await this.paymentService.validateTopup({
        userId,
        flwRef,
        otp,
        amount,
        currencyCode,
      });

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.message || 'Validation failed');
      }

      return ResponseUtil.success(res, {
        message: 'Wallet top-up successful',
        transaction: result.transaction,
        wallet: {
          balance: result.newBalance,
          currency_code: currencyCode,
        },
      });
    } catch (error: any) {
      logger.error('Validate top-up error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to validate top-up');
    }
  };

  /**
   * Add test funds to wallet (FOR TESTING ONLY)
   * POST /api/wallet/add-test-funds
   */
  addTestFunds = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { amount, currencyCode = 'NGN' } = req.body;

      if (!amount || amount <= 0) {
        return ResponseUtil.badRequest(res, 'Invalid amount');
      }

      if (amount > 50000) {
        return ResponseUtil.badRequest(res, 'Maximum test amount is ₦50,000');
      }

      // Create credit transaction
      const reference = `test_fund_${Date.now()}_${userId}`;

      const { data: transaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: userId,
          transaction_type: 'credit',
          amount: amount,
          currency_code: currencyCode,
          status: 'completed',
          description: 'Test funds added to wallet',
          reference: reference,
          metadata: {
            funding_type: 'test_funds',
            added_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Add test funds error:', error);
        return ResponseUtil.error(res, 'Failed to add test funds');
      }

      // Get updated balance
      const newBalance = await this.paymentService.getUserWalletBalance(userId, currencyCode);

      logger.info('Test funds added successfully:', {
        userId,
        amount,
        newBalance,
        reference,
      });

      return ResponseUtil.success(res, {
        message: 'Test funds added successfully',
        transaction: {
          id: transaction.id,
          amount: amount,
          currency_code: currencyCode,
          reference: reference,
        },
        wallet: {
          balance: newBalance,
          currency_code: currencyCode,
        },
      });
    } catch (error: any) {
      logger.error('Add test funds error:', error);
      return ResponseUtil.error(res, 'Failed to add test funds');
    }
  };

  /**
   * Get wallet balance
   * GET /api/wallet/balance
   */
  getWalletBalance = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const currencyCode = (req.query.currency as string) || 'NGN';

      const balance = await this.paymentService.getUserWalletBalance(userId, currencyCode);

      return ResponseUtil.success(res, {
        wallet: {
          balance: balance,
          currency_code: currencyCode,
        },
      });
    } catch (error: any) {
      logger.error('Get wallet balance error:', error);
      return ResponseUtil.error(res, 'Failed to get wallet balance');
    }
  };

  /**
   * Get wallet transaction history
   * GET /api/wallet/transactions
   */
  getTransactionHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.paymentService.getUserTransactions(userId, page, limit);

      return ResponseUtil.success(res, {
        transactions: result.transactions,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error: any) {
      logger.error('Get transaction history error:', error);
      return ResponseUtil.error(res, 'Failed to get transaction history');
    }
  };
}