import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';
import config from '../config';

interface WalletBalanceResponse {
  success: boolean;
  data: {
    wallet: {
      balance: number;
      currency_code: string;
    };
  };
}

interface DeductWalletPayload {
  userId: string;
  amount: number;
  currencyCode: string;
  reference: string;
  description: string;
}

interface DeductWalletResponse {
  success: boolean;
  data: {
    transaction: {
      id: string;
      amount: number;
      status: string;
      reference: string;
    };
    wallet: {
      balance: number;
      currency_code: string;
    };
  };
}

interface CreditWalletPayload {
  userId: string;
  amount: number;
  currencyCode: string;
  reference: string;
  description: string;
}

export class WalletIntegrationService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.payment.url,
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': config.payment.internalApiKey,
      },
      timeout: 30000,
    });

    logger.info('WalletIntegrationService initialized', {
      paymentServiceUrl: config.payment.url,
      hasApiKey: !!config.payment.internalApiKey,
    });
  }

  /**
   * Get user wallet balance
   */
  async getWalletBalance(userId: string, currencyCode: string = 'NGN'): Promise<number> {
    try {
      logger.info('Fetching wallet balance', { userId, currencyCode });

      const response = await this.client.get<WalletBalanceResponse>(
        `/api/internal/payment/wallet/balance`,
        {
          params: { currency: currencyCode },
          headers: { 'x-user-id': userId },
        }
      );

      const balance = response.data.data.wallet.balance;

      logger.info('Wallet balance fetched', { userId, balance, currencyCode });

      return balance;
    } catch (error: any) {
      logger.error('Failed to fetch wallet balance', {
        userId,
        error: error.response?.data || error.message,
        status: error.response?.status,
      });
      throw new Error(error.response?.data?.message || 'Failed to fetch wallet balance');
    }
  }

  /**
   * Deduct amount from user wallet
   */
  async deductFromWallet(payload: DeductWalletPayload): Promise<DeductWalletResponse['data']> {
    try {
      logger.info('Deducting from wallet', {
        userId: payload.userId,
        amount: payload.amount,
        reference: payload.reference,
      });

      const response = await this.client.post<DeductWalletResponse>(
        `/api/internal/payment/wallet/deduct`,
        {
          amount: payload.amount,
          currency_code: payload.currencyCode,
          reference: payload.reference,
          description: payload.description,
          transaction_type: 'debit',
        },
        {
          headers: { 'x-user-id': payload.userId },
        }
      );

      logger.info('Wallet deduction successful', {
        userId: payload.userId,
        amount: payload.amount,
        reference: payload.reference,
        transactionId: response.data.data.transaction.id,
      });

      return response.data.data;
    } catch (error: any) {
      logger.error('Failed to deduct from wallet', {
        userId: payload.userId,
        amount: payload.amount,
        reference: payload.reference,
        error: error.response?.data || error.message,
        status: error.response?.status,
      });
      throw new Error(error.response?.data?.message || 'Failed to deduct from wallet');
    }
  }

  /**
   * Credit/refund amount to user wallet
   */
  async refundToWallet(payload: CreditWalletPayload): Promise<void> {
    try {
      logger.info('Crediting wallet (refund)', {
        userId: payload.userId,
        amount: payload.amount,
        reference: payload.reference,
      });

      await this.client.post(
        `/api/internal/payment/wallet/credit`,
        {
          amount: payload.amount,
          currency_code: payload.currencyCode,
          reference: payload.reference,
          description: payload.description,
          transaction_type: 'credit',
        },
        {
          headers: { 'x-user-id': payload.userId },
        }
      );

      logger.info('Wallet credit (refund) successful', {
        userId: payload.userId,
        amount: payload.amount,
        reference: payload.reference,
      });
    } catch (error: any) {
      logger.error('Failed to credit wallet (refund)', {
        userId: payload.userId,
        amount: payload.amount,
        reference: payload.reference,
        error: error.response?.data || error.message,
        status: error.response?.status,
      });
      throw new Error(error.response?.data?.message || 'Failed to refund to wallet');
    }
  }
}

export default new WalletIntegrationService();
