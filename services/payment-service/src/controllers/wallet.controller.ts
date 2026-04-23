import { Request, Response } from 'express';
import { WalletService } from '../services/wallet.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import logger from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

export class WalletController {
  getBalance = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const currencyCode = (req.query.currency as string) || 'NGN';
      const balance = await WalletService.getBalance(userId, currencyCode);
      return ResponseUtil.success(res, { wallet: { balance, currency_code: currencyCode } });
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  topup = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const userEmail = (req as AuthRequest).user!.email;
      const { amount, currency_code = 'NGN', card_id, card_details } = req.body;

      if (!amount || amount <= 0) return ResponseUtil.badRequest(res, 'Invalid amount');
      if (amount < 100) return ResponseUtil.badRequest(res, 'Minimum top-up amount is ₦100');
      if (!card_id && !card_details) return ResponseUtil.badRequest(res, 'Either card_id or card_details is required');

      const result = await WalletService.topupViaCard({
        userId,
        userEmail,
        amount,
        currencyCode: currency_code,
        cardId: card_id,
        cardDetails: card_details ? {
          cardNumber: card_details.card_number,
          cvv: card_details.cvv,
          expiryMonth: card_details.expiry_month,
          expiryYear: card_details.expiry_year,
          cardholderName: card_details.fullname,
          pin: card_details.pin,
        } : undefined,
      });

      if (!result.success) return ResponseUtil.badRequest(res, result.message || 'Top-up failed');

      if (result.requiresAuthorization) {
        return ResponseUtil.success(res, {
          status: 'pending_authorization',
          message: 'Please validate the charge with OTP',
          authorization: result.authorization,
          flw_ref: result.flw_ref,
          tx_ref: result.tx_ref,
          amount,
          currency_code,
        });
      }

      return ResponseUtil.success(res, {
        message: 'Wallet top-up successful',
        transaction: result.transaction,
        wallet: { balance: result.newBalance, currency_code },
      });
    } catch (err: unknown) {
      logger.error('Wallet top-up error:', err);
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  validateTopup = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { flw_ref, otp, amount, currency_code = 'NGN' } = req.body;

      if (!flw_ref || !otp || !amount) return ResponseUtil.badRequest(res, 'flw_ref, otp and amount are required');

      const result = await WalletService.validateTopup({ userId, flwRef: flw_ref, otp, amount, currencyCode: currency_code });

      if (!result.success) return ResponseUtil.badRequest(res, result.message || 'Validation failed');

      return ResponseUtil.success(res, {
        message: 'Wallet top-up successful',
        transaction: result.transaction,
        wallet: { balance: result.newBalance, currency_code },
      });
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getTransactions = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const result = await WalletService.getTransactionHistory(userId, page, limit);
      return ResponseUtil.success(res, {
        transactions: result.transactions,
        pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
      });
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };
}
