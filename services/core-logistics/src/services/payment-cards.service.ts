import axios, { AxiosInstance } from 'axios';
import { logger } from '../config/logger';
import { config } from '../config/env';

/**
 * PaymentCardsService — Phase 3 migration
 *
 * All card operations are now delegated to payment-service.
 * This class is kept as a thin proxy so existing callers in core-logistics
 * (wallet.controller.ts, payment.service.ts) don't need to change their imports.
 */
export class PaymentCardsService {
  private client: AxiosInstance;
  private internalApiKey: string;

  constructor() {
    this.internalApiKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';

    this.client = axios.create({
      baseURL: config.paymentServiceUrl,
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': this.internalApiKey,
      },
      timeout: 30000,
    });
  }

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
      const response = await this.client.post('/api/payment/cards', data, {
        headers: { 'x-user-id': data.userId },
      });
      return response.data?.data;
    } catch (error: any) {
      logger.error('Add card (via payment-service) error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to add card');
    }
  }

  async getUserCards(userId: string, _activeOnly: boolean = true): Promise<any[]> {
    try {
      const response = await this.client.get('/api/payment/cards', {
        headers: { 'x-user-id': userId },
      });
      return response.data?.data?.cards || [];
    } catch (error: any) {
      logger.error('Get user cards (via payment-service) error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to get cards');
    }
  }

  async getCard(cardId: string, userId: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/payment/cards/${cardId}`, {
        headers: { 'x-user-id': userId },
      });
      return response.data?.data;
    } catch (error: any) {
      logger.error('Get card (via payment-service) error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to get card');
    }
  }

  async getDefaultCard(userId: string): Promise<any | null> {
    try {
      const cards = await this.getUserCards(userId);
      return cards.find((c: any) => c.is_default) || null;
    } catch (error: any) {
      logger.error('Get default card (via payment-service) error:', error.response?.data || error.message);
      return null;
    }
  }

  async setDefaultCard(cardId: string, userId: string): Promise<any> {
    try {
      const response = await this.client.patch(
        `/api/payment/cards/${cardId}/default`,
        {},
        { headers: { 'x-user-id': userId } }
      );
      return response.data?.data;
    } catch (error: any) {
      logger.error('Set default card (via payment-service) error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to set default card');
    }
  }

  async deleteCard(cardId: string, userId: string): Promise<void> {
    try {
      await this.client.delete(`/api/payment/cards/${cardId}`, {
        headers: { 'x-user-id': userId },
      });
    } catch (error: any) {
      logger.error('Delete card (via payment-service) error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to delete card');
    }
  }

  async chargeCard(data: {
    cardId: string;
    userId: string;
    amount: number;
    currency: string;
    email: string;
    txRef: string;
  }): Promise<any> {
    try {
      const response = await this.client.post(
        '/api/internal/payment/flutterwave/charge-tokenized',
        {
          cardId: data.cardId,
          userId: data.userId,
          amount: data.amount,
          currency: data.currency,
          email: data.email,
          tx_ref: data.txRef,
        },
        { headers: { 'x-user-id': data.userId } }
      );
      return response.data?.data;
    } catch (error: any) {
      logger.error('Charge card (via payment-service) error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to charge card');
    }
  }
}
