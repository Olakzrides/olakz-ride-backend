import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { FlutterwaveService } from './flutterwave.service';

export class PaymentCardsService {
  private flutterwaveService: FlutterwaveService;

  constructor() {
    this.flutterwaveService = new FlutterwaveService();
  }

  /**
   * Add a new payment card
   */
  async addCard(data: {
    userId: string;
    cardToken: string;
    authorizationCode?: string;
    cardLast4: string;
    cardBrand: string;
    cardType?: string;
    cardExpMonth: string;
    cardExpYear: string;
    cardholderName?: string;
    bankName?: string;
    countryCode?: string;
    isDefault?: boolean;
    metadata?: any;
  }): Promise<any> {
    try {
      // If this is set as default, unset other default cards
      if (data.isDefault) {
        await this.unsetDefaultCards(data.userId);
      }

      const { data: card, error } = await supabase
        .from('payment_cards')
        .insert({
          user_id: data.userId,
          card_token: data.cardToken,
          authorization_code: data.authorizationCode,
          card_last4: data.cardLast4,
          card_brand: data.cardBrand,
          card_type: data.cardType,
          card_exp_month: data.cardExpMonth,
          card_exp_year: data.cardExpYear,
          cardholder_name: data.cardholderName,
          bank_name: data.bankName,
          country_code: data.countryCode,
          is_default: data.isDefault || false,
          is_active: true,
          provider: 'flutterwave',
          metadata: data.metadata || {},
        })
        .select()
        .single();

      if (error) throw error;

      logger.info('Payment card added', { userId: data.userId, cardLast4: data.cardLast4 });
      return card;
    } catch (error) {
      logger.error('Add payment card error:', error);
      throw error;
    }
  }

  /**
   * Get user's payment cards
   */
  async getUserCards(userId: string, activeOnly: boolean = true): Promise<any[]> {
    try {
      let query = supabase
        .from('payment_cards')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Get user cards error:', error);
      throw error;
    }
  }

  /**
   * Get a specific card
   */
  async getCard(cardId: string, userId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('payment_cards')
        .select('*')
        .eq('id', cardId)
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Get card error:', error);
      throw error;
    }
  }

  /**
   * Get default card
   */
  async getDefaultCard(userId: string): Promise<any | null> {
    try {
      const { data, error} = await supabase
        .from('payment_cards')
        .select('*')
        .eq('user_id', userId)
        .eq('is_default', true)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data;
    } catch (error) {
      logger.error('Get default card error:', error);
      throw error;
    }
  }

  /**
   * Set a card as default
   */
  async setDefaultCard(cardId: string, userId: string): Promise<any> {
    try {
      // Verify card ownership
      const card = await this.getCard(cardId, userId);
      if (!card) {
        throw new Error('Card not found');
      }

      // Unset other default cards
      await this.unsetDefaultCards(userId);

      // Set this card as default
      const { data, error } = await supabase
        .from('payment_cards')
        .update({
          is_default: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cardId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      logger.info('Default card set', { userId, cardId });
      return data;
    } catch (error) {
      logger.error('Set default card error:', error);
      throw error;
    }
  }

  /**
   * Delete a card
   */
  async deleteCard(cardId: string, userId: string): Promise<void> {
    try {
      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('payment_cards')
        .update({
          is_active: false,
          is_default: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cardId)
        .eq('user_id', userId);

      if (error) throw error;

      logger.info('Payment card deleted', { userId, cardId });
    } catch (error) {
      logger.error('Delete card error:', error);
      throw error;
    }
  }

  /**
   * Charge a saved card
   */
  async chargeCard(data: {
    cardId: string;
    userId: string;
    amount: number;
    currency: string;
    email: string;
    txRef: string;
  }): Promise<any> {
    try {
      // Get card details
      const card = await this.getCard(data.cardId, data.userId);
      if (!card) {
        throw new Error('Card not found');
      }

      if (!card.is_active) {
        throw new Error('Card is not active');
      }

      // Use the email from metadata (Flutterwave customer email) if available
      // Flutterwave requires the SAME email used during tokenization
      const chargeEmail = card.metadata?.customer_email || data.email;

      logger.info('Charging card with email:', {
        providedEmail: data.email,
        storedEmail: card.metadata?.customer_email,
        usingEmail: chargeEmail,
      });

      // Charge using Flutterwave
      const chargeResponse = await this.flutterwaveService.chargeTokenizedCard({
        token: card.card_token,
        currency: data.currency,
        amount: data.amount,
        email: chargeEmail,
        tx_ref: data.txRef,
        country: card.country_code || 'NG',
      });

      logger.info('Card charged successfully', {
        userId: data.userId,
        cardId: data.cardId,
        amount: data.amount,
        txRef: data.txRef,
      });

      return chargeResponse;
    } catch (error) {
      logger.error('Charge card error:', error);
      throw error;
    }
  }

  /**
   * Unset all default cards for a user
   */
  private async unsetDefaultCards(userId: string): Promise<void> {
    try {
      await supabase
        .from('payment_cards')
        .update({
          is_default: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_default', true);
    } catch (error) {
      logger.error('Unset default cards error:', error);
      // Don't throw, this is a helper function
    }
  }
}
