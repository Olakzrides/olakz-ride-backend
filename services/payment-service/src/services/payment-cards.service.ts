import { supabase } from '../config/database';
import { flutterwaveService } from './flutterwave.service';
import logger from '../utils/logger';

export class PaymentCardsService {
  static async addCard(data: {
    userId: string;
    cardToken: string;
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
  }) {
    if (data.isDefault) {
      await supabase
        .from('payment_cards')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', data.userId)
        .eq('is_default', true);
    }

    const { data: card, error } = await supabase
      .from('payment_cards')
      .insert({
        user_id: data.userId,
        card_token: data.cardToken,
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
  }

  static async getCard(cardId: string, userId: string) {
    const { data, error } = await supabase
      .from('payment_cards')
      .select('id, card_last4, card_brand, card_type, card_exp_month, card_exp_year, cardholder_name, bank_name, is_default, country_code, metadata, created_at')
      .eq('id', cardId)
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;
    return data;
  }

  static async getUserCards(userId: string) {
    const { data, error } = await supabase
      .from('payment_cards')
      .select('id, card_last4, card_brand, card_type, card_exp_month, card_exp_year, cardholder_name, bank_name, is_default, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async deleteCard(cardId: string, userId: string) {
    const { error } = await supabase
      .from('payment_cards')
      .update({ is_active: false, is_default: false, updated_at: new Date().toISOString() })
      .eq('id', cardId)
      .eq('user_id', userId);

    if (error) throw error;
    logger.info('Payment card deleted', { userId, cardId });
  }

  static async setDefaultCard(cardId: string, userId: string) {
    await supabase
      .from('payment_cards')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_default', true);

    const { data, error } = await supabase
      .from('payment_cards')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', cardId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async chargeCard(params: {
    cardId: string;
    userId: string;
    amount: number;
    currency: string;
    email: string;
    txRef: string;
  }) {
    const { data: card, error } = await supabase
      .from('payment_cards')
      .select('*')
      .eq('id', params.cardId)
      .eq('user_id', params.userId)
      .single();

    if (error || !card) throw new Error('Card not found');
    if (!card.is_active) throw new Error('Card is not active');

    const chargeEmail = card.metadata?.customer_email || params.email;

    return flutterwaveService.chargeTokenizedCard({
      token: card.card_token,
      currency: params.currency,
      amount: params.amount,
      email: chargeEmail,
      tx_ref: params.txRef,
      country: card.country_code || 'NG',
    });
  }
}
