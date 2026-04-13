import { Request, Response } from 'express';
import { PaymentCardsService } from '../services/payment-cards.service';
import { WalletService } from '../services/wallet.service';
import { flutterwaveService } from '../services/flutterwave.service';
import { supabase } from '../config/database';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import logger from '../utils/logger';

export class CardsController {
  listCards = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const cards = await PaymentCardsService.getUserCards(userId);
      return ResponseUtil.success(res, { cards });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // Save a new card by tokenizing it via Flutterwave (charges ₦50 to verify)
  addCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const userEmail = (req as AuthRequest).user!.email;
      const { card_number, cvv, expiry_month, expiry_year, fullname, pin, is_default } = req.body;

      if (!card_number || !cvv || !expiry_month || !expiry_year) {
        return ResponseUtil.badRequest(res, 'card_number, cvv, expiry_month and expiry_year are required');
      }

      const txRef = `save_card_${userId}_${Date.now()}`;

      const chargeResult = await flutterwaveService.tokenizeCard({
        card_number,
        cvv,
        expiry_month,
        expiry_year,
        currency: 'NGN',
        amount: 50, // ₦50 verification charge
        email: userEmail,
        fullname,
        tx_ref: txRef,
        authorization: pin ? { mode: 'pin', pin } : { mode: 'pin' },
      });

      // OTP required before card can be saved
      if (chargeResult.data?.status === 'pending') {
        return ResponseUtil.success(res, {
          status: 'pending_authorization',
          message: 'Enter OTP to complete card verification',
          flw_ref: chargeResult.data.flw_ref,
          tx_ref: txRef,
        });
      }

      if (chargeResult.status !== 'success' || chargeResult.data?.status !== 'successful') {
        return ResponseUtil.badRequest(res, chargeResult.message || 'Card verification failed');
      }

      const cardData = chargeResult.data.card;
      const card = await PaymentCardsService.addCard({
        userId,
        cardToken: cardData.token,
        cardLast4: cardData.last_4digits,
        cardBrand: cardData.issuer,
        cardType: cardData.type,
        cardExpMonth: expiry_month,
        cardExpYear: expiry_year,
        cardholderName: fullname,
        countryCode: cardData.country,
        isDefault: is_default || false,
        metadata: { customer_email: userEmail, flw_ref: chargeResult.data.flw_ref },
      });

      // Refund the ₦50 verification charge
      await WalletService.credit({
        userId,
        amount: 50,
        currencyCode: 'NGN',
        reference: `card_verify_refund_${txRef}`,
        description: 'Refund: card verification charge',
      });

      logger.info('Card saved successfully', { userId, cardLast4: cardData.last_4digits });
      return ResponseUtil.created(res, { card }, 'Card saved successfully');
    } catch (err: any) {
      logger.error('Add card error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  deleteCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      await PaymentCardsService.deleteCard(req.params.id, userId);
      return ResponseUtil.success(res, null, 'Card deleted');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  setDefault = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const card = await PaymentCardsService.setDefaultCard(req.params.id, userId);
      return ResponseUtil.success(res, { card }, 'Default card updated');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { data: card, error } = await supabase
        .from('payment_cards')
        .select('id, card_last4, card_brand, card_type, card_exp_month, card_exp_year, cardholder_name, bank_name, is_default, country_code, metadata, created_at')
        .eq('id', req.params.id)
        .eq('user_id', userId)
        .single();

      if (error || !card) return ResponseUtil.notFound(res, 'Card not found');
      return ResponseUtil.success(res, card);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // Validate OTP to complete card save (Step 2 after addCard returns pending_authorization)
  validateCardAddition = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const userEmail = (req as AuthRequest).user!.email;
      const { flw_ref, otp, fullname, is_default } = req.body;

      if (!flw_ref || !otp) return ResponseUtil.badRequest(res, 'flw_ref and otp are required');

      const validationResult = await flutterwaveService.validateCharge(flw_ref, otp);

      if (validationResult.status !== 'success') {
        return ResponseUtil.badRequest(res, validationResult.message || 'Card validation failed');
      }

      // Get card data — may be in validationResult.data or need to verify transaction
      let cardData = validationResult.data?.card;
      let flwRef = validationResult.data?.flw_ref;

      if (!cardData?.token) {
        const txData = await flutterwaveService.verifyTransaction(String(validationResult.data?.id));
        cardData = txData.data?.card;
        flwRef = txData.data?.flw_ref;
        if (!cardData?.token) {
          return ResponseUtil.badRequest(res, 'Card token not found in validation response');
        }
      }

      const expiryParts = (cardData.expiry || '').split('/');
      const expMonth = expiryParts[0]?.trim().substring(0, 2) || '01';
      const expYear = expiryParts[1]?.trim().substring(0, 4) || '2099';

      const card = await PaymentCardsService.addCard({
        userId,
        cardToken: cardData.token,
        cardLast4: cardData.last_4digits,
        cardBrand: cardData.type?.trim().substring(0, 20) || cardData.issuer?.trim().substring(0, 20) || 'UNKNOWN',
        cardType: cardData.type?.trim().substring(0, 20) || null,
        cardExpMonth: expMonth,
        cardExpYear: expYear,
        cardholderName: fullname,
        countryCode: cardData.country?.trim().substring(0, 2) || 'NG',
        isDefault: is_default || false,
        metadata: {
          customer_email: userEmail,
          flw_ref: flwRef,
          first_6digits: cardData.first_6digits,
          full_issuer: cardData.issuer,
        },
      });

      logger.info('Card saved after OTP validation', { userId, cardLast4: cardData.last_4digits });
      return ResponseUtil.created(res, { card }, 'Card saved successfully');
    } catch (err: any) {
      logger.error('Validate card addition error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
