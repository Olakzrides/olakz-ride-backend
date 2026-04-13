import { Request, Response } from 'express';
import { WalletService } from '../services/wallet.service';
import { flutterwaveService } from '../services/flutterwave.service';
import { ResponseUtil } from '../utils/response';
import logger from '../utils/logger';

export class InternalController {
  getBalance = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return ResponseUtil.badRequest(res, 'x-user-id header is required');

      const currencyCode = (req.query.currency as string) || 'NGN';
      const balance = await WalletService.getBalance(userId, currencyCode);
      return ResponseUtil.success(res, { wallet: { balance, currency_code: currencyCode } });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  deduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return ResponseUtil.badRequest(res, 'x-user-id header is required');

      const { amount, currency_code = 'NGN', reference, description } = req.body;
      if (!amount || amount <= 0) return ResponseUtil.badRequest(res, 'Invalid amount');
      if (!reference) return ResponseUtil.badRequest(res, 'reference is required');

      const { transactionId, newBalance } = await WalletService.deduct({
        userId,
        amount,
        currencyCode: currency_code,
        reference,
        description: description || 'Wallet deduction',
      });

      logger.info('Internal wallet deduct', { userId, amount, reference });
      return ResponseUtil.success(res, {
        transaction: { id: transactionId, amount, status: 'completed', reference },
        wallet: { balance: newBalance, currency_code },
      });
    } catch (err: any) {
      if (err.message?.includes('Insufficient')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  credit = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return ResponseUtil.badRequest(res, 'x-user-id header is required');

      const { amount, currency_code = 'NGN', reference, description } = req.body;
      if (!amount || amount <= 0) return ResponseUtil.badRequest(res, 'Invalid amount');
      if (!reference) return ResponseUtil.badRequest(res, 'reference is required');

      const { transactionId, newBalance } = await WalletService.credit({
        userId,
        amount,
        currencyCode: currency_code,
        reference,
        description: description || 'Wallet credit',
      });

      logger.info('Internal wallet credit', { userId, amount, reference });
      return ResponseUtil.success(res, {
        transaction: { id: transactionId, amount, status: 'completed', reference },
        wallet: { balance: newBalance, currency_code },
      });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── Flutterwave card operations (for food-service and other services) ────────

  chargeCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await flutterwaveService.tokenizeCard(req.body);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  chargeTokenizedCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await flutterwaveService.chargeTokenizedCard(req.body);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  validateCharge = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { flw_ref, otp } = req.body;
      if (!flw_ref || !otp) return ResponseUtil.badRequest(res, 'flw_ref and otp are required');
      const result = await flutterwaveService.validateCharge(flw_ref, otp);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  refundTransaction = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { transaction_id, amount } = req.body;
      if (!transaction_id) return ResponseUtil.badRequest(res, 'transaction_id is required');
      const result = await flutterwaveService.refundTransaction(transaction_id, amount);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  verifyTransaction = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { transaction_id } = req.body;
      if (!transaction_id) return ResponseUtil.badRequest(res, 'transaction_id is required');
      const result = await flutterwaveService.verifyTransaction(String(transaction_id));
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
