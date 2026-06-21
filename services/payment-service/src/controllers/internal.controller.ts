import { Request, Response } from 'express';
import { WalletService } from '../services/wallet.service';
import { flutterwaveService } from '../services/flutterwave.service';
import { ResponseUtil } from '../utils/response';
import logger from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

export class InternalController {
  getBalance = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return ResponseUtil.badRequest(res, 'x-user-id header is required');

      const currencyCode = (req.query.currency as string) || 'NGN';
      const balance = await WalletService.getBalance(userId, currencyCode);
      return ResponseUtil.success(res, { wallet: { balance, currency_code: currencyCode } });
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  deduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return ResponseUtil.badRequest(res, 'x-user-id header is required');

      const { amount, currency_code = 'NGN', reference, description } = req.body;
      if (!amount || amount <= 0) return ResponseUtil.badRequest(res, 'Invalid amount');
      if (!reference) return ResponseUtil.badRequest(res, 'reference is required');

      // Get split balance BEFORE deduction so we can record how much came from each bucket.
      // This lets callers store cash_portion/promo_portion for correct refund routing later.
      const before = await WalletService.getWalletBalances(userId, currency_code);

      const { transactionId, newBalance } = await WalletService.deduct({
        userId,
        amount,
        currencyCode: currency_code,
        reference,
        description: description || 'Wallet deduction',
      });

      // Calculate portions: cash is spent first, promo covers the remainder
      const promoPortion = Math.max(0, amount - before.cashBalance);
      const cashPortion  = amount - promoPortion;

      logger.info('Internal wallet deduct', { userId, amount, reference, cashPortion, promoPortion });
      return ResponseUtil.success(res, {
        transaction: {
          id:           transactionId,
          amount,
          status:       'completed',
          reference,
          cash_portion:  cashPortion,   // store in calling service metadata for refund routing
          promo_portion: promoPortion,  // store in calling service metadata for refund routing
        },
        wallet: { balance: newBalance, currency_code },
      });
    } catch (err: unknown) {
      const message = toMessage(err);
      if (message.includes('Insufficient')) return ResponseUtil.badRequest(res, message);
      return ResponseUtil.serverError(res, message);
    }
  };

  credit = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return ResponseUtil.badRequest(res, 'x-user-id header is required');

      const { amount, currency_code = 'NGN', reference, description, transaction_type } = req.body;
      if (!amount || amount <= 0) return ResponseUtil.badRequest(res, 'Invalid amount');
      if (!reference) return ResponseUtil.badRequest(res, 'reference is required');

      const { transactionId, newBalance } = await WalletService.credit({
        userId,
        amount,
        currencyCode: currency_code,
        reference,
        description: description || 'Wallet credit',
        transactionType: transaction_type,
      });

      logger.info('Internal wallet credit', { userId, amount, reference, transaction_type });
      return ResponseUtil.success(res, {
        transaction: { id: transactionId, amount, status: 'completed', reference },
        wallet: { balance: newBalance, currency_code },
      });
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  chargeCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await flutterwaveService.tokenizeCard(req.body);
      return ResponseUtil.success(res, result);
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  chargeTokenizedCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await flutterwaveService.chargeTokenizedCard(req.body);
      return ResponseUtil.success(res, result);
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  validateCharge = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { flw_ref, otp } = req.body;
      if (!flw_ref || !otp) return ResponseUtil.badRequest(res, 'flw_ref and otp are required');
      const result = await flutterwaveService.validateCharge(flw_ref, otp);
      return ResponseUtil.success(res, result);
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  refundTransaction = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { transaction_id, amount } = req.body;
      if (!transaction_id) return ResponseUtil.badRequest(res, 'transaction_id is required');
      const result = await flutterwaveService.refundTransaction(transaction_id, amount);
      return ResponseUtil.success(res, result);
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  verifyTransaction = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { transaction_id } = req.body;
      if (!transaction_id) return ResponseUtil.badRequest(res, 'transaction_id is required');
      const result = await flutterwaveService.verifyTransaction(String(transaction_id));
      return ResponseUtil.success(res, result);
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };
}
