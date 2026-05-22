import { Request, Response } from 'express';
import { supabase } from '../config/database';
import { flutterwaveService } from '../services/flutterwave.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import logger from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

export class VirtualAccountController {
  /**
   * POST /api/payment/wallet/virtual-account
   * Generate (or return existing) permanent virtual account for the user
   * Requires bvn on first call only
   */
  getOrCreate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const userEmail = (req as AuthRequest).user!.email;
      const currencyCode = 'NGN';

      // Return existing if already created
      const { data: existing } = await supabase
        .from('virtual_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('currency_code', currencyCode)
        .single();

      if (existing) {
        return ResponseUtil.success(res, { virtual_account: existing });
      }

      // BVN required for first-time creation (Flutterwave/CBN requirement for static accounts)
      const { bvn } = req.body;
      if (!bvn) {
        return ResponseUtil.badRequest(res, 'bvn is required to generate a virtual account');
      }
      if (!/^\d{11}$/.test(bvn)) {
        return ResponseUtil.badRequest(res, 'BVN must be 11 digits');
      }

      // Fetch user details for account name
      const { data: user } = await supabase
        .from('users')
        .select('first_name, last_name, phone')
        .eq('id', userId)
        .single();

      const firstname = user?.first_name || 'Olakz';
      const lastname = user?.last_name || 'User';
      const phonenumber = user?.phone || undefined;

      const txRef = `va_${userId}_${Date.now()}`;

      const result = await flutterwaveService.createVirtualAccount({
        email: userEmail,
        isPermanent: true,
        bvn,
        txRef,
        currency: currencyCode,
        narration: `Olakz wallet - ${firstname} ${lastname}`,
        firstname,
        lastname,
        phonenumber,
      });

      if (result.status !== 'success' || !result.data?.account_number) {
        logger.error('Virtual account creation failed from Flutterwave', { result });
        return ResponseUtil.serverError(res, result.message || 'Failed to create virtual account');
      }

      const { data: saved, error: saveError } = await supabase
        .from('virtual_accounts')
        .insert({
          user_id: userId,
          account_number: result.data.account_number,
          bank_name: result.data.bank_name,
          account_name: result.data.account_name || `${firstname} ${lastname}`,
          flw_ref: result.data.flw_ref,
          order_ref: result.data.order_ref,
          currency_code: currencyCode,
        })
        .select()
        .single();

      if (saveError || !saved) {
        logger.error('Failed to save virtual account to DB', saveError);
        return ResponseUtil.serverError(res, 'Virtual account created but failed to save. Please try again.');
      }

      logger.info('Virtual account created and saved', { userId, accountNumber: saved.account_number });
      return ResponseUtil.created(res, { virtual_account: saved }, 'Virtual account created successfully');
    } catch (err: unknown) {
      logger.error('Virtual account getOrCreate error:', err);
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * GET /api/payment/wallet/virtual-account
   * Fetch existing virtual account for the user
   */
  get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;

      const { data: account } = await supabase
        .from('virtual_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('currency_code', 'NGN')
        .single();

      if (!account) {
        return ResponseUtil.notFound(res, 'No virtual account found. Call POST to generate one.');
      }

      return ResponseUtil.success(res, { virtual_account: account });
    } catch (err: unknown) {
      return ResponseUtil.serverError(res, toMessage(err));
    }
  };
}
