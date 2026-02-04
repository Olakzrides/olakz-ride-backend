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