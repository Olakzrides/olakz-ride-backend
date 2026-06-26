import axios from 'axios';
import logger from '../utils/logger';

const PAYMENT_URL = () => process.env.PAYMENT_SERVICE_URL || 'http://localhost:3007';
const INTERNAL_KEY = () => process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';

function extractAxiosError(err: any): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNREFUSED') return `Payment service is not reachable (${PAYMENT_URL()})`;
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') return 'Payment service timed out';
    const serverMsg = err.response?.data?.message;
    if (serverMsg) return serverMsg;
    return err.message || `HTTP ${err.response?.status} from payment service`;
  }
  return err?.message || 'Unknown wallet service error';
}

export class WalletService {
  /**
   * Get total spendable balance (cash + promo).
   * Use for order eligibility checks — both buckets can pay for orders.
   */
  static async getBalance(userId: string): Promise<number> {
    const balances = await this.getBalances(userId);
    return balances.totalBalance;
  }

  /**
   * Get split balance — cash vs promo.
   * Use when you need to record cash_portion/promo_portion for refund routing.
   */
  static async getBalances(userId: string): Promise<{
    cashBalance: number;
    promoBalance: number;
    totalBalance: number;
  }> {
    try {
      const res = await axios.get(`${PAYMENT_URL()}/api/internal/payment/wallet/balance`, {
        headers: { 'x-internal-api-key': INTERNAL_KEY(), 'x-user-id': userId },
        timeout: 8000,
      });
      const wallet = res.data?.data?.wallet;
      const total  = parseFloat(wallet?.total_balance ?? wallet?.balance ?? '0');
      return {
        cashBalance:  parseFloat(wallet?.cash_balance  ?? total.toString()),
        promoBalance: parseFloat(wallet?.promo_balance ?? '0'),
        totalBalance: total,
      };
    } catch (err: any) {
      throw new Error(extractAxiosError(err));
    }
  }

  static async deduct(params: {
    userId: string;
    amount: number;
    reference: string;
    description: string;
  }): Promise<{ transactionId: string; newBalance: number; cashPortion: number; promoPortion: number }> {
    try {
      const res = await axios.post(
        `${PAYMENT_URL()}/api/internal/payment/wallet/deduct`,
        { amount: params.amount, reference: params.reference, description: params.description },
        { headers: { 'x-internal-api-key': INTERNAL_KEY(), 'x-user-id': params.userId }, timeout: 8000 }
      );
      const tx = res.data?.data?.transaction;
      return {
        transactionId: tx?.id,
        newBalance:    res.data?.data?.wallet?.balance,
        cashPortion:   tx?.cash_portion  ?? params.amount,
        promoPortion:  tx?.promo_portion ?? 0,
      };
    } catch (err: any) {
      throw new Error(extractAxiosError(err));
    }
  }

  static async credit(params: {
    userId: string;
    amount: number;
    reference: string;
    description: string;
    transactionType?: string;
  }): Promise<void> {
    try {
      await axios.post(
        `${PAYMENT_URL()}/api/internal/payment/wallet/credit`,
        {
          amount:           params.amount,
          reference:        params.reference,
          description:      params.description,
          transaction_type: params.transactionType,
        },
        { headers: { 'x-internal-api-key': INTERNAL_KEY(), 'x-user-id': params.userId }, timeout: 8000 }
      );
    } catch (err: any) {
      logger.error('Wallet credit failed', { error: extractAxiosError(err), params });
      throw new Error(extractAxiosError(err));
    }
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
  }): Promise<void> {
    const { userId, cashPortion, promoPortion, baseReference, description } = params;

    if (cashPortion > 0) {
      await this.credit({
        userId,
        amount:          cashPortion,
        reference:       `${baseReference}_refund_cash`,
        description:     `${description} (cash)`,
        transactionType: 'refund',        // → cash bucket
      });
    }

    if (promoPortion > 0) {
      await this.credit({
        userId,
        amount:          promoPortion,
        reference:       `${baseReference}_refund_promo`,
        description:     `${description} (promo)`,
        transactionType: 'promo_credit',  // → promo bucket
      });
    }
  }
}
