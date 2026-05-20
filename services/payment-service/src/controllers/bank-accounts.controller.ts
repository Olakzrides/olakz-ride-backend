import { Request, Response } from 'express';
import { supabase } from '../config/database';
import { flutterwaveService } from '../services/flutterwave.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import logger from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

export class BankAccountsController {
  /**
   * GET /api/payment/banks
   * Returns list of Nigerian banks from Flutterwave
   */
  getBanks = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const result = await flutterwaveService.getBanks('NG');
      const banks = (result.data || []).map((b: any) => ({
        id: b.id,
        code: b.code,
        name: b.name,
      }));
      return ResponseUtil.success(res, { banks });
    } catch (err: unknown) {
      logger.error('Get banks error:', err);
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * POST /api/payment/bank-accounts
   * Verify account name via Flutterwave then save the bank account
   */
  addBankAccount = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { account_number, bank_code, bank_name, is_default = false } = req.body;

      if (!account_number || !bank_code || !bank_name) {
        return ResponseUtil.badRequest(res, 'account_number, bank_code and bank_name are required');
      }

      // Verify account name via Flutterwave
      const resolveResult = await flutterwaveService.resolveAccount(account_number, bank_code);

      if (resolveResult.status !== 'success' || !resolveResult.data?.account_name) {
        return ResponseUtil.badRequest(res, 'Could not verify account. Please check the account number and bank.');
      }

      const accountName = resolveResult.data.account_name;

      // If setting as default, unset current default first
      if (is_default) {
        await supabase
          .from('bank_accounts')
          .update({ is_default: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('is_default', true);
      }

      const { data: account, error } = await supabase
        .from('bank_accounts')
        .insert({
          user_id: userId,
          account_number,
          account_name: accountName,
          bank_code,
          bank_name,
          is_default,
          is_verified: true,
        })
        .select()
        .single();

      if (error) {
        logger.error('Add bank account error:', error);
        return ResponseUtil.serverError(res, 'Failed to save bank account');
      }

      logger.info('Bank account added', { userId, accountNumber: account_number, bankCode: bank_code });
      return ResponseUtil.created(res, { bank_account: account }, 'Bank account added successfully');
    } catch (err: unknown) {
      logger.error('Add bank account error:', err);
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * GET /api/payment/bank-accounts
   * List user's saved bank accounts
   */
  listBankAccounts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;

      const { data: accounts, error } = await supabase
        .from('bank_accounts')
        .select('id, account_number, account_name, bank_code, bank_name, is_default, is_verified, created_at')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('List bank accounts error:', error);
        return ResponseUtil.serverError(res, 'Failed to fetch bank accounts');
      }

      return ResponseUtil.success(res, { bank_accounts: accounts || [], count: (accounts || []).length });
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * DELETE /api/payment/bank-accounts/:id
   * Remove a bank account
   */
  deleteBankAccount = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { id } = req.params;

      const { error } = await supabase
        .from('bank_accounts')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        logger.error('Delete bank account error:', error);
        return ResponseUtil.serverError(res, 'Failed to delete bank account');
      }

      logger.info('Bank account deleted', { userId, id });
      return ResponseUtil.success(res, null, 'Bank account deleted');
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * PATCH /api/payment/bank-accounts/:id/default
   * Set a bank account as the default
   */
  setDefaultBankAccount = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { id } = req.params;

      // Unset current default
      await supabase
        .from('bank_accounts')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_default', true);

      // Set new default
      const { data: account, error } = await supabase
        .from('bank_accounts')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error || !account) {
        return ResponseUtil.notFound(res, 'Bank account not found');
      }

      logger.info('Default bank account updated', { userId, id });
      return ResponseUtil.success(res, { bank_account: account }, 'Default bank account updated');
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };
}
