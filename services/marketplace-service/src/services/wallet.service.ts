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
  static async getBalance(userId: string): Promise<number> {
    try {
      const res = await axios.get(`${PAYMENT_URL()}/api/internal/payment/wallet/balance`, {
        headers: {
          'x-internal-api-key': INTERNAL_KEY(),
          'x-user-id': userId,
        },
        timeout: 8000,
      });
      return parseFloat(res.data?.data?.wallet?.balance ?? '0');
    } catch (err: any) {
      throw new Error(extractAxiosError(err));
    }
  }

  static async deduct(params: { userId: string; amount: number; reference: string; description: string }) {
    try {
      const res = await axios.post(
        `${PAYMENT_URL()}/api/internal/payment/wallet/deduct`,
        {
          amount: params.amount,
          reference: params.reference,
          description: params.description,
        },
        {
          headers: {
            'x-internal-api-key': INTERNAL_KEY(),
            'x-user-id': params.userId,
          },
          timeout: 8000,
        }
      );
      return {
        transactionId: res.data?.data?.transaction?.id,
        newBalance: res.data?.data?.wallet?.balance,
      };
    } catch (err: any) {
      throw new Error(extractAxiosError(err));
    }
  }

  static async credit(params: { userId: string; amount: number; reference: string; description: string }) {
    try {
      await axios.post(
        `${PAYMENT_URL()}/api/internal/payment/wallet/credit`,
        {
          amount: params.amount,
          reference: params.reference,
          description: params.description,
        },
        {
          headers: {
            'x-internal-api-key': INTERNAL_KEY(),
            'x-user-id': params.userId,
          },
          timeout: 8000,
        }
      );
    } catch (err: any) {
      logger.error('Wallet credit failed', { error: extractAxiosError(err), params });
      throw new Error(extractAxiosError(err));
    }
  }
}
