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

  async initiateTransfer(payload: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
    amount: number;
    narration: string;
    reference: string;
    currency?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post('/transfers', {
        account_bank: payload.bankCode,
        account_number: payload.accountNumber,
        amount: payload.amount,
        narration: payload.narration,
        currency: payload.currency || 'NGN',
        reference: payload.reference,
        beneficiary_name: payload.accountName,
        callback_url: process.env.FLW_TRANSFER_CALLBACK_URL || '',
      });
      logger.info('Transfer initiated', { reference: payload.reference, status: response.data.status });
      return response.data;
    } catch (error: any) {
      logger.error('Transfer initiation failed', { error: error.response?.data || error.message });
      throw new Error(error.response?.data?.message || 'Failed to initiate transfer');
    }
  }

  async getTransferFee(amount: number, currency: string = 'NGN'): Promise<number> {
    try {
      const response = await this.client.get('/transfers/fee', {
        params: { amount, currency, type: 'account' },
      });
      const fee = response.data?.data?.[0]?.fee ?? 0;
      return Number(fee);
    } catch (error: any) {
      logger.error('Get transfer fee failed', { error: error.response?.data || error.message });
      return 0;
    }
  }

  async getBanks(country: string = 'NG'): Promise<any> {
    try {
      const response = await this.client.get(`/banks/${country}`);
      logger.info('Banks fetched', { country, count: response.data.data?.length });
      return response.data;
    } catch (error: any) {
      logger.error('Get banks failed', { error: error.response?.data || error.message });
      throw new Error(error.response?.data?.message || 'Failed to fetch banks');
    }
  }

  async resolveAccount(accountNumber: string, bankCode: string): Promise<any> {
    try {
      const response = await this.client.post('/accounts/resolve', {
        account_number: accountNumber,
        account_bank: bankCode,
      });
      logger.info('Account resolved', { accountNumber, bankCode, status: response.data.status });
      return response.data;
    } catch (error: any) {
      logger.error('Account resolve failed', { error: error.response?.data || error.message });
      throw new Error(error.response?.data?.message || 'Failed to resolve account');
    }
  }

  async createVirtualAccount(payload: {
    email: string;
    isPermanent: boolean;
    bvn?: string;
    txRef: string;
    amount?: number;
    currency?: string;
    narration?: string;
    firstname?: string;
    lastname?: string;
    phonenumber?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post('/virtual-account-numbers', {
        email: payload.email,
        is_permanent: payload.isPermanent,
        bvn: payload.bvn,
        tx_ref: payload.txRef,
        amount: payload.amount,
        currency: payload.currency || 'NGN',
        narration: payload.narration || 'Olakz wallet funding',
        firstname: payload.firstname,
        lastname: payload.lastname,
        phonenumber: payload.phonenumber,
      });
      logger.info('Virtual account created', { txRef: payload.txRef, status: response.data.status });
      return response.data;
    } catch (error: any) {
      logger.error('Virtual account creation failed', { error: error.response?.data || error.message });
      throw new Error(error.response?.data?.message || 'Failed to create virtual account');
    }
  }
}

export const flutterwaveService = new FlutterwaveService();
