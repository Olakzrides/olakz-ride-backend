import axios, { AxiosInstance } from 'axios';
import CryptoJS from 'crypto-js';
import logger from '../utils/logger';
import config from '../config';

export class FlutterwaveService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.flutterwave.baseUrl,
      headers: {
        Authorization: `Bearer ${config.flutterwave.secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  private encrypt3DES(data: string): string {
    const key = CryptoJS.enc.Utf8.parse(config.flutterwave.encryptionKey);
    const encrypted = CryptoJS.TripleDES.encrypt(data, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  }

  async tokenizeCard(payload: {
    card_number: string;
    cvv: string;
    expiry_month: string;
    expiry_year: string;
    currency: string;
    amount: number;
    email: string;
    fullname?: string;
    tx_ref: string;
    authorization?: { mode: string; pin?: string };
  }): Promise<any> {
    try {
      const encryptedPayload = this.encrypt3DES(JSON.stringify(payload));
      const response = await this.client.post('/charges?type=card', { client: encryptedPayload });
      logger.info('Card tokenization response', { status: response.data.status, tx_ref: payload.tx_ref });
      return response.data;
    } catch (error: any) {
      logger.error('Card tokenization failed', { error: error.response?.data || error.message });
      throw new Error(error.response?.data?.message || 'Failed to tokenize card');
    }
  }

  async chargeTokenizedCard(payload: {
    token: string;
    currency: string;
    amount: number;
    email: string;
    tx_ref: string;
    country?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post('/tokenized-charges', {
        ...payload,
        redirect_url: 'https://webhook.site/redirect',
      });
      logger.info('Tokenized card charge response', { status: response.data.status, tx_ref: payload.tx_ref });
      return response.data;
    } catch (error: any) {
      logger.error('Tokenized card charge failed', { error: error.response?.data || error.message });
      throw new Error(error.response?.data?.message || 'Failed to charge card');
    }
  }

  async validateCharge(flwRef: string, otp: string): Promise<any> {
    try {
      const response = await this.client.post('/validate-charge', { otp, flw_ref: flwRef });
      logger.info('Charge validation response', { status: response.data.status, flw_ref: flwRef });
      return response.data;
    } catch (error: any) {
      logger.error('Charge validation failed', { error: error.response?.data || error.message });
      throw new Error(error.response?.data?.message || 'Failed to validate charge');
    }
  }

  async verifyTransaction(transactionId: string): Promise<any> {
    try {
      const response = await this.client.get(`/transactions/${transactionId}/verify`);
      return response.data;
    } catch (error: any) {
      logger.error('Transaction verification failed', { error: error.response?.data || error.message });
      throw new Error(error.response?.data?.message || 'Failed to verify transaction');
    }
  }

  async refundTransaction(transactionId: string, amount?: number): Promise<any> {
    try {
      const payload: any = { id: transactionId };
      if (amount) payload.amount = amount;
      const response = await this.client.post('/transactions/refund', payload);
      logger.info('Refund initiated', { status: response.data.status, transactionId });
      return response.data;
    } catch (error: any) {
      logger.error('Refund failed', { error: error.response?.data || error.message });
      throw new Error(error.response?.data?.message || 'Failed to initiate refund');
    }
  }
}

export const flutterwaveService = new FlutterwaveService();
