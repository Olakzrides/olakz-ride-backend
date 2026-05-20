import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/database';
import { WalletService } from '../services/wallet.service';
import { flutterwaveService } from '../services/flutterwave.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import logger from '../utils/logger';
import config from '../config';

const MIN_WITHDRAWAL = 1000;

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

export class WithdrawalsController {
  /**
   * POST /api/payment/withdrawals
   * Initiate a withdrawal to a saved bank account
   */
  initiateWithdrawal = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { bank_account_id, amount } = req.body;

      if (!bank_account_id) {
        return ResponseUtil.badRequest(res, 'bank_account_id is required');
      }
      if (!amount || amount <= 0) {
        return ResponseUtil.badRequest(res, 'Invalid amount');
      }
      if (amount < MIN_WITHDRAWAL) {
        return ResponseUtil.badRequest(res, `Minimum withdrawal amount is ₦${MIN_WITHDRAWAL.toLocaleString()}`);
      }

      // Verify bank account belongs to user
      const { data: bankAccount, error: bankError } = await supabase
        .from('bank_accounts')
        .select('id, account_number, account_name, bank_code, bank_name')
        .eq('id', bank_account_id)
        .eq('user_id', userId)
        .single();

      if (bankError || !bankAccount) {
        return ResponseUtil.notFound(res, 'Bank account not found');
      }

      // Get Flutterwave transfer fee
      const fee = await flutterwaveService.getTransferFee(amount);
      const totalDeduction = amount + fee;
      const netAmount = amount; // what lands in the bank

      // Check earned balance — only earned money can be withdrawn
      const earnedBalance = await WalletService.getEarnedBalance(userId);
      if (earnedBalance < totalDeduction) {
        return ResponseUtil.badRequest(
          res,
          `Insufficient earned balance. Available to withdraw: ₦${earnedBalance.toLocaleString()}${fee > 0 ? ` (includes ₦${fee} transfer fee)` : ''}`
        );
      }

      // Deduct total (amount + fee) from wallet immediately to prevent double withdrawal
      const reference = `withdrawal_${userId}_${Date.now()}`;
      await WalletService.credit({
        userId,
        amount: totalDeduction,
        currencyCode: 'NGN',
        reference,
        description: `Withdrawal to ${bankAccount.bank_name} - ${bankAccount.account_number}`,
        transactionType: 'withdrawal',
      });

      // Create withdrawal record as 'processing'
      const { data: withdrawal, error: withdrawalError } = await supabase
        .from('withdrawals')
        .insert({
          user_id: userId,
          bank_account_id,
          amount,
          fee,
          net_amount: netAmount,
          status: 'processing',
          flw_reference: reference,
        })
        .select()
        .single();

      if (withdrawalError || !withdrawal) {
        // Refund the deduction if we couldn't create the record
        await WalletService.credit({
          userId,
          amount: totalDeduction,
          currencyCode: 'NGN',
          reference: `refund_${reference}`,
          description: 'Withdrawal refund - record creation failed',
          transactionType: 'earning',
        });
        logger.error('Failed to create withdrawal record:', withdrawalError);
        return ResponseUtil.serverError(res, 'Failed to initiate withdrawal');
      }

      // Call Flutterwave transfer API
      try {
        const transferResult = await flutterwaveService.initiateTransfer({
          accountNumber: bankAccount.account_number,
          bankCode: bankAccount.bank_code,
          accountName: bankAccount.account_name,
          amount,
          narration: `Olakz earnings withdrawal`,
          reference,
        });

        if (transferResult.status === 'success') {
          const flwTransferId = transferResult.data?.id?.toString();

          await supabase
            .from('withdrawals')
            .update({
              flw_transfer_id: flwTransferId,
              status: 'processing',
              updated_at: new Date().toISOString(),
            })
            .eq('id', withdrawal.id);

          logger.info('Withdrawal initiated successfully', { userId, withdrawalId: withdrawal.id, amount });

          return ResponseUtil.created(res, {
            withdrawal: {
              id: withdrawal.id,
              amount,
              fee,
              net_amount: netAmount,
              status: 'processing',
              bank_account: {
                bank_name: bankAccount.bank_name,
                account_number: bankAccount.account_number,
                account_name: bankAccount.account_name,
              },
            },
          }, 'Withdrawal initiated. Funds will be transferred to your bank account shortly.');
        } else {
          // Flutterwave rejected — refund and mark failed
          await this.handleFailedTransfer(withdrawal.id, userId, totalDeduction, reference, transferResult.message || 'Transfer rejected by payment provider');
          return ResponseUtil.badRequest(res, transferResult.message || 'Transfer failed. Please try again.');
        }
      } catch (transferError: any) {
        // Transfer call threw — refund and mark failed
        await this.handleFailedTransfer(withdrawal.id, userId, totalDeduction, reference, transferError.message);
        return ResponseUtil.serverError(res, 'Transfer failed. Your balance has been restored.');
      }
    } catch (err: unknown) {
      logger.error('Initiate withdrawal error:', err);
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * GET /api/payment/withdrawals
   * List user's withdrawal history
   */
  listWithdrawals = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      const { data: withdrawals, error, count } = await supabase
        .from('withdrawals')
        .select(`
          id, amount, fee, net_amount, status, flw_transfer_id,
          failure_reason, created_at, updated_at,
          bank_account:bank_accounts(account_number, account_name, bank_name)
        `, { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('List withdrawals error:', error);
        return ResponseUtil.serverError(res, 'Failed to fetch withdrawals');
      }

      // Also return current earned balance
      const earnedBalance = await WalletService.getEarnedBalance(userId);

      return ResponseUtil.success(res, {
        withdrawals: withdrawals || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
        earned_balance: earnedBalance,
      });
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * POST /api/payment/webhooks/flutterwave
   * Receive Flutterwave transfer webhook — no JWT auth, verified by hash
   */
  flutterwaveWebhook = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Verify webhook signature
      const secretHash = config.flutterwave.webhookSecret;
      const signature = req.headers['verif-hash'] as string;

      if (!secretHash || signature !== secretHash) {
        logger.warn('Invalid Flutterwave webhook signature');
        return res.status(401).json({ message: 'Invalid signature' });
      }

      const event = req.body;
      logger.info('Flutterwave webhook received', { event: event.event, reference: event.data?.reference });

      // Only handle transfer events
      if (event.event !== 'transfer.completed') {
        return res.status(200).json({ message: 'Event ignored' });
      }

      const { reference, status, id: flwTransferId } = event.data || {};

      if (!reference) {
        return res.status(200).json({ message: 'No reference' });
      }

      // Find the withdrawal by flw_reference
      const { data: withdrawal } = await supabase
        .from('withdrawals')
        .select('id, user_id, amount, fee, status')
        .eq('flw_reference', reference)
        .single();

      if (!withdrawal) {
        logger.warn('Webhook: withdrawal not found for reference', { reference });
        return res.status(200).json({ message: 'Withdrawal not found' });
      }

      // Skip if already finalized
      if (withdrawal.status === 'completed' || withdrawal.status === 'failed') {
        return res.status(200).json({ message: 'Already processed' });
      }

      if (status === 'SUCCESSFUL') {
        await supabase
          .from('withdrawals')
          .update({
            status: 'completed',
            flw_transfer_id: flwTransferId?.toString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', withdrawal.id);

        logger.info('Withdrawal completed via webhook', { withdrawalId: withdrawal.id });
      } else if (status === 'FAILED') {
        const failureReason = event.data?.complete_message || 'Transfer failed';

        await supabase
          .from('withdrawals')
          .update({
            status: 'failed',
            failure_reason: failureReason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', withdrawal.id);

        // Refund the deducted amount back to earned balance
        const totalDeduction = Number(withdrawal.amount) + Number(withdrawal.fee);
        await WalletService.credit({
          userId: withdrawal.user_id,
          amount: totalDeduction,
          currencyCode: 'NGN',
          reference: `refund_${reference}_${Date.now()}`,
          description: `Withdrawal refund - transfer failed`,
          transactionType: 'earning',
        });

        logger.info('Withdrawal failed, refunded', { withdrawalId: withdrawal.id, amount: totalDeduction });
      }

      return res.status(200).json({ message: 'Webhook processed' });
    } catch (err: unknown) {
      logger.error('Flutterwave webhook error:', err);
      return res.status(200).json({ message: 'Error processing webhook' }); // Always 200 to Flutterwave
    }
  };

  private async handleFailedTransfer(
    withdrawalId: string,
    userId: string,
    totalDeduction: number,
    reference: string,
    reason: string
  ): Promise<void> {
    await supabase
      .from('withdrawals')
      .update({
        status: 'failed',
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', withdrawalId);

    await WalletService.credit({
      userId,
      amount: totalDeduction,
      currencyCode: 'NGN',
      reference: `refund_${reference}`,
      description: 'Withdrawal refund - transfer failed',
      transactionType: 'earning',
    });

    logger.info('Withdrawal failed and refunded', { withdrawalId, amount: totalDeduction, reason });
  }
}
