import axios, { AxiosInstance } from 'axios';
import CryptoJS from 'crypto-js';
import logger from '../utils/logger';

export class FoodFlutterwaveService {
  private client: AxiosInstance;
  private encryptionKey: string;

  constructor() {
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
    this.encryptionKey = process.env.FLUTTERWAVE_ENCRYPTION_KEY || '';

    this.client = axios.create({
      baseURL: process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  private encrypt3DES(data: string): string {
    const key = CryptoJS.enc.Utf8.parse(this.encryptionKey);
    return CryptoJS.TripleDES.encrypt(data, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  }

  /**
   * Charge a card (new card — may require OTP/PIN authorization)
   */
  async chargeCard(payload: {
    card_number: string;
    cvv: string;
    expiry_month: string;
    expiry_year: string;
    amount: number;
    currency: string;
    email: string;
    fullname?: string;
    tx_ref: string;
    authorization?: { mode: string; pin?: string };
  }): Promise<any> {
    try {
      const encrypted = this.encrypt3DES(JSON.stringify(payload));
      const response = await this.client.post('/charges?type=card', { client: encrypted });
      logger.info('Card charge initiated', { tx_ref: payload.tx_ref, status: response.data.status });
      return response.data;
    } catch (err: any) {
      logger.error('Card charge failed', { error: err.response?.data || err.message });
      throw new Error(err.response?.data?.message || 'Failed to charge card');
    }
  }

  /**
   * Validate OTP / PIN for a pending charge
   */
  async validateCharge(flwRef: string, otp: string): Promise<any> {
    try {
      const response = await this.client.post('/validate-charge', { otp, flw_ref: flwRef });
      logger.info('Charge validated', { flw_ref: flwRef, status: response.data.status });
      return response.data;
    } catch (err: any) {
      logger.error('Charge validation failed', { error: err.response?.data || err.message });
      throw new Error(err.response?.data?.message || 'Failed to validate charge');
    }
  }

  /**
   * Charge a saved/tokenized card
   */
  async chargeTokenizedCard(payload: {
    token: string;
    currency: string;
    amount: number;
    email: string;
    tx_ref: string;
  }): Promise<any> {
    try {
      const response = await this.client.post('/tokenized-charges', {
        ...payload,
        redirect_url: 'https://webhook.site/redirect',
      });
      logger.info('Tokenized card charged', { tx_ref: payload.tx_ref });
      return response.data;
    } catch (err: any) {
      logger.error('Tokenized card charge failed', { error: err.response?.data || err.message });
      throw new Error(err.response?.data?.message || 'Failed to charge tokenized card');
    }
  }

  /**
   * Verify a transaction by ID
   */
  async verifyTransaction(transactionId: string): Promise<any> {
    try {
      const response = await this.client.get(`/transactions/${transactionId}/verify`);
      return response.data;
    } catch (err: any) {
      logger.error('Transaction verification failed', { error: err.response?.data || err.message });
      throw new Error(err.response?.data?.message || 'Failed to verify transaction');
    }
  }

  /**
   * Refund a transaction
   */
  async refundTransaction(transactionId: string, amount?: number): Promise<any> {
    try {
      const payload: any = { id: transactionId };
      if (amount) payload.amount = amount;
      const response = await this.client.post('/transactions/refund', payload);
      logger.info('Refund initiated', { transactionId });
      return response.data;
    } catch (err: any) {
      logger.error('Refund failed', { error: err.response?.data || err.message });
      throw new Error(err.response?.data?.message || 'Failed to initiate refund');
    }
  }
}

export const foodFlutterwaveService = new FoodFlutterwaveService();
