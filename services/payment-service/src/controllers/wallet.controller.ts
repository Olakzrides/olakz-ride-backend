import { Request, Response } from 'express';
import { WalletService } from '../services/wallet.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { supabase } from '../config/database';
import logger from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

export class WalletController {
getBalance = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId       = (req as AuthRequest).user!.id;
      const currencyCode = (req.query.currency as string) || 'NGN';
 
      // Fetch balances, earned balance, and user identity all in parallel
      const [balances, earnedBalance, userRow] = await Promise.all([
        WalletService.getWalletBalances(userId, currencyCode),
        WalletService.getEarnedBalance(userId, currencyCode),
        supabase
          .from('users')
          .select('first_name, last_name, phone')
          .eq('id', userId)
          .maybeSingle()
          .then(r => r.data),
      ]);
 
      const firstName = (userRow as any)?.first_name ?? '';
      const lastName  = (userRow as any)?.last_name  ?? '';
      const fullName  = `${firstName} ${lastName}`.trim().toUpperCase() || 'USER';
      const phone     = (userRow as any)?.phone ?? null;
 
      // Withdrawable = min(earned, cash) — driver can't withdraw more than is physically in wallet
      const withdrawableBalance = Math.min(earnedBalance, balances.cashBalance);
 
      return ResponseUtil.success(res, {
        wallet: {
          owner: {
            name:  fullName,
            phone, // wallet ID — full number, no masking
          },
          cash_balance:         balances.cashBalance,
          promo_balance:        balances.promoBalance,
          total_balance:        balances.totalBalance,
          earned_balance:       earnedBalance,        // lifetime earnings eligibility ceiling
          withdrawable_balance: withdrawableBalance,  // what can actually be withdrawn right now
          currency_code:        currencyCode,
        },
      });
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

  /**
   * GET /api/wallet/transfer/lookup?phone=08012345678
   * Look up a recipient by phone number — returns display name for confirmation.
   * Frontend shows this before the user confirms the transfer.
   */
  lookupRecipient = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const phone  = req.query.phone as string;

      if (!phone) return ResponseUtil.badRequest(res, 'phone query param is required');

      const recipient = await WalletService.lookupRecipientByPhone(phone, userId);

      if (!recipient) {
        return ResponseUtil.notFound(res, 'No Olakz wallet account found for this phone number');
      }

      return ResponseUtil.success(res, { recipient }, 'Recipient found');
    } catch (err: unknown) {
      logger.error('Wallet lookup error:', err);
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * POST /api/wallet/transfer
   * Transfer money from the authenticated user's wallet to another by phone number.
   * Body: { "phone": "08012345678", "amount": 500, "note": "Thanks!" }
   */
  transfer = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { phone, amount, note } = req.body;

      if (!phone)             return ResponseUtil.badRequest(res, 'Recipient phone number is required');
      if (!amount)            return ResponseUtil.badRequest(res, 'Amount is required');
      if (isNaN(Number(amount)) || Number(amount) <= 0)
        return ResponseUtil.badRequest(res, 'Amount must be a positive number');

      const result = await WalletService.transferByPhone({
        senderUserId:   userId,
        recipientPhone: phone,
        amount:         Number(amount),
        note:           note?.trim() || undefined,
      });

      return ResponseUtil.success(res, {
        message:          `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })} sent successfully to ${result.recipient.displayName}`,
        transaction_ref:  result.transactionRef,
        amount:           result.amount,
        recipient:        result.recipient,
        wallet: {
          balance:       result.senderNewBalance,
          currency_code: 'NGN',
        },
      });
    } catch (err: unknown) {
      const msg = toMessage(err);
      logger.error('Wallet transfer error:', err);
      if (
        msg.includes('Insufficient') ||
        msg.includes('not found') ||
        msg.includes('Minimum') ||
        msg.includes('greater than zero')
      ) {
        return ResponseUtil.badRequest(res, msg);
      }
      return ResponseUtil.serverError(res, msg);
    }
  };
}
