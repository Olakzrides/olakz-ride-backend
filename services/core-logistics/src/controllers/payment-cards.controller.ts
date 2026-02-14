import { Request, Response } from 'express';
import { PaymentCardsService } from '../services/payment-cards.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export class PaymentCardsController {
  private paymentCardsService: PaymentCardsService;
  private flutterwaveService: FlutterwaveService;

  constructor() {
    this.paymentCardsService = new PaymentCardsService();
    this.flutterwaveService = new FlutterwaveService();
  }

  /**
   * Add a new payment card
   * POST /api/payment/cards
   */
  addCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const {
        cardNumber,
        cvv,
        expiryMonth,
        expiryYear,
        cardholderName,
        pin,
        isDefault,
      } = req.body;

      // Validate required fields
      if (!cardNumber || !cvv || !expiryMonth || !expiryYear) {
        return ResponseUtil.badRequest(res, 'Card details are required');
      }

      // Get user email
      const userEmail = (req as any).user?.email;
      
      // Log user object for debugging
      logger.info('User from token:', { user: (req as any).user });
      
      if (!userEmail) {
        return ResponseUtil.badRequest(res, 'User email is required');
      }

      // Generate transaction reference
      const txRef = `card_${userId}_${Date.now()}`;

      // Tokenize card with Flutterwave (charges ₦50 for verification)
      const tokenizeResponse = await this.flutterwaveService.tokenizeCard({
        card_number: cardNumber,
        cvv,
        expiry_month: expiryMonth,
        expiry_year: expiryYear,
        currency: 'NGN',
        amount: 50, // ₦50 verification charge
        email: userEmail,
        fullname: cardholderName,
        tx_ref: txRef,
        authorization: pin ? { mode: 'pin', pin } : { mode: 'pin' },
      });

      // Log full response for debugging
      logger.info('Flutterwave tokenization full response:', { 
        status: tokenizeResponse.status,
        message: tokenizeResponse.message,
        data: tokenizeResponse.data 
      });

      // Check if tokenization requires additional authorization
      if (tokenizeResponse.status === 'success' && tokenizeResponse.data.status === 'pending') {
        // Card charge initiated, needs authorization (OTP, PIN, etc.)
        return ResponseUtil.success(res, {
          status: 'pending_authorization',
          message: tokenizeResponse.message || 'Card verification initiated',
          authorization: tokenizeResponse.data.authorization,
          flw_ref: tokenizeResponse.data.flw_ref,
          tx_ref: txRef,
        });
      }

      // Check if tokenization was successful and card is tokenized
      if (tokenizeResponse.status !== 'success' || !tokenizeResponse.data.card?.token) {
        return ResponseUtil.badRequest(res, tokenizeResponse.message || 'Failed to add card');
      }

      // Save card to database
      const card = await this.paymentCardsService.addCard({
        userId,
        cardToken: tokenizeResponse.data.card.token,
        cardLast4: tokenizeResponse.data.card.last_4digits,
        cardBrand: tokenizeResponse.data.card.issuer,
        cardType: tokenizeResponse.data.card.type,
        cardExpMonth: expiryMonth,
        cardExpYear: expiryYear,
        cardholderName,
        countryCode: tokenizeResponse.data.card.country,
        isDefault: isDefault || false,
        metadata: {
          flw_ref: tokenizeResponse.data.flw_ref,
          first_6digits: tokenizeResponse.data.card.first_6digits,
        },
      });

      // Remove sensitive data before sending response
      const { card_token, authorization_code, ...safeCard } = card;

      return ResponseUtil.success(res, {
        card: safeCard,
        message: 'Card added successfully',
      });
    } catch (error: any) {
      logger.error('Add card error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to add card');
    }
  };

  /**
   * Validate card addition (submit OTP)
   * POST /api/payment/cards/validate
   */
  validateCardAddition = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { flwRef, otp, cardholderName, isDefault } = req.body;

      if (!flwRef || !otp) {
        return ResponseUtil.badRequest(res, 'Flutterwave reference and OTP are required');
      }

      // Validate the charge with Flutterwave
      const validationResponse = await this.flutterwaveService.validateCharge(flwRef, otp);

      logger.info('Validation response full data:', { 
        status: validationResponse.status,
        data: validationResponse.data 
      });

      if (validationResponse.status !== 'success') {
        return ResponseUtil.badRequest(res, validationResponse.message || 'Card validation failed');
      }

      // Check if card token exists in the response
      if (!validationResponse.data?.card?.token) {
        // If no token, we need to verify the transaction to get card details
        const transactionData = await this.flutterwaveService.verifyTransaction(validationResponse.data.id);
        
        if (!transactionData.data?.card?.token) {
          return ResponseUtil.badRequest(res, 'Card token not found in validation response');
        }

        // Use transaction data for card details
        const expiryParts = transactionData.data.card.expiry.split('/');
        const expMonth = expiryParts[0]?.trim().substring(0, 2) || '01';
        const expYear = expiryParts[1]?.trim().substring(0, 4) || '2099';
        
        // Use 'type' for brand (e.g., MASTERCARD, VISA) and 'issuer' for full description
        const cardBrand = transactionData.data.card.type?.trim().substring(0, 20) || 'UNKNOWN';
        const cardType = transactionData.data.card.type?.trim().substring(0, 20) || null;
        const countryCode = transactionData.data.card.country?.trim().substring(0, 2) || 'NG';

        logger.info('Card data parsed:', { 
          expiry: transactionData.data.card.expiry,
          month: expMonth,
          year: expYear,
          brand: cardBrand,
          type: cardType,
          country: countryCode,
          rawIssuer: transactionData.data.card.issuer,
          customerEmail: transactionData.data.customer?.email
        });

        const card = await this.paymentCardsService.addCard({
          userId,
          cardToken: transactionData.data.card.token,
          cardLast4: transactionData.data.card.last_4digits,
          cardBrand,
          cardType,
          cardExpMonth: expMonth,
          cardExpYear: expYear,
          cardholderName,
          countryCode,
          isDefault: isDefault || false,
          metadata: {
            flw_ref: transactionData.data.flw_ref,
            first_6digits: transactionData.data.card.first_6digits,
            full_issuer: transactionData.data.card.issuer,
            customer_email: transactionData.data.customer?.email, // Store Flutterwave customer email
          },
        });

        const { card_token, authorization_code, ...safeCard } = card;

        return ResponseUtil.success(res, {
          card: safeCard,
          message: 'Card added successfully',
        });
      }

      // Save card to database using validation response
      const card = await this.paymentCardsService.addCard({
        userId,
        cardToken: validationResponse.data.card.token,
        cardLast4: validationResponse.data.card.last_4digits,
        cardBrand: validationResponse.data.card.issuer,
        cardType: validationResponse.data.card.type,
        cardExpMonth: validationResponse.data.card.expiry.split('/')[0],
        cardExpYear: validationResponse.data.card.expiry.split('/')[1],
        cardholderName,
        countryCode: validationResponse.data.card.country,
        isDefault: isDefault || false,
        metadata: {
          flw_ref: validationResponse.data.flw_ref,
          first_6digits: validationResponse.data.card.first_6digits,
        },
      });

      // Remove sensitive data before sending response
      const { card_token, authorization_code, ...safeCard } = card;

      return ResponseUtil.success(res, {
        card: safeCard,
        message: 'Card added successfully',
      });
    } catch (error: any) {
      logger.error('Validate card addition error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to validate card');
    }
  };

  /**
   * Get user's payment cards
   * GET /api/payment/cards
   */
  getCards = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const cards = await this.paymentCardsService.getUserCards(userId);

      // Remove sensitive data
      const safeCards = cards.map(({ card_token, authorization_code, ...card }) => card);

      return ResponseUtil.success(res, {
        cards: safeCards,
        count: safeCards.length,
      });
    } catch (error) {
      logger.error('Get cards error:', error);
      return ResponseUtil.serverError(res, 'Failed to get cards');
    }
  };

  /**
   * Set a card as default
   * POST /api/payment/cards/:cardId/set-default
   */
  setDefaultCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { cardId } = req.params;

      const card = await this.paymentCardsService.setDefaultCard(cardId, userId);

      // Remove sensitive data
      const { card_token, authorization_code, ...safeCard } = card;

      return ResponseUtil.success(res, {
        card: safeCard,
        message: 'Default card set successfully',
      });
    } catch (error: any) {
      logger.error('Set default card error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to set default card');
    }
  };

  /**
   * Delete a card
   * DELETE /api/payment/cards/:cardId
   */
  deleteCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { cardId } = req.params;

      await this.paymentCardsService.deleteCard(cardId, userId);

      return ResponseUtil.success(res, {
        message: 'Card deleted successfully',
      });
    } catch (error: any) {
      logger.error('Delete card error:', error);
      return ResponseUtil.serverError(res, error.message || 'Failed to delete card');
    }
  };

  /**
   * Get default card
   * GET /api/payment/cards/default
   */
  getDefaultCard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const card = await this.paymentCardsService.getDefaultCard(userId);

      if (!card) {
        return ResponseUtil.success(res, {
          card: null,
          message: 'No default card set',
        });
      }

      // Remove sensitive data
      const { card_token, authorization_code, ...safeCard } = card;

      return ResponseUtil.success(res, {
        card: safeCard,
      });
    } catch (error) {
      logger.error('Get default card error:', error);
      return ResponseUtil.serverError(res, 'Failed to get default card');
    }
  };
}
