import axios from 'axios';
import config from '../config';
import logger from '../utils/logger';

const INTERNAL_HEADERS = {
  'x-internal-api-key': config.internalApiKey,
  'Content-Type': 'application/json',
};

export class WalletService {
  private static get baseUrl() { return config.services.payment; }

  /**
   * Get total spendable balance (cash + promo).
   * Use for order eligibility checks — both buckets can pay for orders.
   */
  static async getBalance(userId: string, currencyCode = 'NGN'): Promise<number> {
    const balances = await this.getBalances(userId, currencyCode);
    return balances.totalBalance;
  }

  /**
   * Get split balance — cash vs promo.
   * Use when you need to record cash_portion/promo_portion for refund routing.
   */
  static async getBalances(userId: string, currencyCode = 'NGN'): Promise<{
    cashBalance: number;
    promoBalance: number;
    totalBalance: number;
  }> {
    const response = await axios.get(
      `${this.baseUrl}/api/internal/payment/wallet/balance`,
      {
        headers: { ...INTERNAL_HEADERS, 'x-user-id': userId },
        params: { currency: currencyCode },
        timeout: 10000,
      }
    );
    const wallet = response.data?.data?.wallet;
    const total  = wallet?.total_balance ?? wallet?.balance ?? 0;
    return {
      cashBalance:  wallet?.cash_balance  ?? total,
      promoBalance: wallet?.promo_balance ?? 0,
      totalBalance: total,
    };
  }

  static async deduct(params: {
    userId: string;
    amount: number;
    reference: string;
    description: string;
    currencyCode?: string;
  }): Promise<{ transactionId: string; newBalance: number; cashPortion: number; promoPortion: number }> {
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
    const tx = response.data?.data?.transaction;
    return {
      transactionId: tx?.id,
      newBalance:    response.data?.data?.wallet?.balance,
      cashPortion:   tx?.cash_portion  ?? params.amount,
      promoPortion:  tx?.promo_portion ?? 0,
    };
  }

  static async credit(params: {
    userId: string;
    amount: number;
    reference: string;
    description: string;
    currencyCode?: string;
    transactionType?: string;
  }): Promise<{ transactionId: string; newBalance: number }> {
    const response = await axios.post(
      `${this.baseUrl}/api/internal/payment/wallet/credit`,
      {
        amount: params.amount,
        currency_code: params.currencyCode || 'NGN',
        reference: params.reference,
        description: params.description,
        transaction_type: params.transactionType,
      },
      {
        headers: { ...INTERNAL_HEADERS, 'x-user-id': params.userId },
        timeout: 10000,
      }
    );
    return {
      transactionId: response.data?.data?.transaction?.id,
      newBalance:    response.data?.data?.wallet?.balance,
    };
  }

  /**
   * Refund an amount back to the correct wallet bucket.
   * Pass cash_portion and promo_portion from the original deduct transaction metadata.
   * If portions are unknown, the full amount goes back as cash (safe default).
   */
  static async refundToBuckets(params: {
    userId: string;
    cashPortion: number;
    promoPortion: number;
    baseReference: string;
    description: string;
    currencyCode?: string;
  }): Promise<void> {
    const { userId, cashPortion, promoPortion, baseReference, description, currencyCode = 'NGN' } = params;

    if (cashPortion > 0) {
      await this.credit({
        userId,
        amount:          cashPortion,
        reference:       `${baseReference}_refund_cash`,
        description:     `${description} (cash)`,
        currencyCode,
        transactionType: 'refund',        // → cash bucket
      });
    }

    if (promoPortion > 0) {
      await this.credit({
        userId,
        amount:          promoPortion,
        reference:       `${baseReference}_refund_promo`,
        description:     `${description} (promo)`,
        currencyCode,
        transactionType: 'promo_credit',  // → promo bucket
      });
    }
  }
}
