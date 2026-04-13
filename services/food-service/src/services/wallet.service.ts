import axios from 'axios';
import config from '../config';
import logger from '../utils/logger';

const INTERNAL_HEADERS = {
  'x-internal-api-key': config.internalApiKey,
  'Content-Type': 'application/json',
};

export class WalletService {
  private static get baseUrl() { return config.services.payment; }

  static async getBalance(userId: string, currencyCode = 'NGN'): Promise<number> {
    const response = await axios.get(
      `${this.baseUrl}/api/internal/payment/wallet/balance`,
      {
        headers: { ...INTERNAL_HEADERS, 'x-user-id': userId },
        params: { currency: currencyCode },
        timeout: 10000,
      }
    );
    return response.data.data.wallet.balance;
  }

  static async deduct(params: {
    userId: string;
    amount: number;
    reference: string;
    description: string;
    currencyCode?: string;
  }): Promise<{ transactionId: string; newBalance: number }> {
    const response = await axios.post(
      `${this.baseUrl}/api/internal/payment/wallet/deduct`,
      {
        amount: params.amount,
        currency_code: params.currencyCode || 'NGN',
        reference: params.reference,
        description: params.description,
      },
      {
        headers: { ...INTERNAL_HEADERS, 'x-user-id': params.userId },
        timeout: 10000,
      }
    );
    return {
      transactionId: response.data.data.transaction.id,
      newBalance: response.data.data.wallet.balance,
    };
  }

  static async credit(params: {
    userId: string;
    amount: number;
    reference: string;
    description: string;
    currencyCode?: string;
  }): Promise<{ transactionId: string; newBalance: number }> {
    const response = await axios.post(
      `${this.baseUrl}/api/internal/payment/wallet/credit`,
      {
        amount: params.amount,
        currency_code: params.currencyCode || 'NGN',
        reference: params.reference,
        description: params.description,
      },
      {
        headers: { ...INTERNAL_HEADERS, 'x-user-id': params.userId },
        timeout: 10000,
      }
    );
    return {
      transactionId: response.data.data.transaction.id,
      newBalance: response.data.data.wallet.balance,
    };
  }
}
