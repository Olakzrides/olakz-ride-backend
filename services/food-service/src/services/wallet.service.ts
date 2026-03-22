import axios from 'axios';
import config from '../config';
import logger from '../utils/logger';

const INTERNAL_HEADERS = {
  'x-internal-api-key': config.internalApiKey,
  'Content-Type': 'application/json',
};

export class WalletService {
  private static baseUrl = config.services.coreLogistics;

  static async getBalance(userId: string, currencyCode = 'NGN'): Promise<number> {
    const response = await axios.get(
      `${this.baseUrl}/api/wallet/internal/balance`,
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
      `${this.baseUrl}/api/wallet/internal/deduct`,
      {
        amount: params.amount,
        currency_code: params.currencyCode || 'NGN',
        reference: params.reference,
        description: params.description,
        transaction_type: 'debit',
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
      `${this.baseUrl}/api/wallet/internal/credit`,
      {
        amount: params.amount,
        currency_code: params.currencyCode || 'NGN',
        reference: params.reference,
        description: params.description,
        transaction_type: 'refund',
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
