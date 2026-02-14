import axios, { AxiosInstance } from 'axios';
import CryptoJS from 'crypto-js';
import { logger } from '../config/logger';

interface FlutterwaveConfig {
  publicKey: string;
  secretKey: string;
  encryptionKey: string;
  baseUrl: string;
}

interface ChargeCardPayload {
  card_number: string;
  cvv: string;
  expiry_month: string;
  expiry_year: string;
  currency: string;
  amount: number;
  email: string;
  fullname?: string;
  tx_ref: string;
  redirect_url?: string;
  authorization?: {
    mode: string;
    pin?: string;
  };
}

interface TokenizeCardResponse {
  status: string;
  message: string;
  data: {
    id: number;
    tx_ref: string;
    flw_ref: string;
    amount: number;
    currency: string;
    charged_amount: number;
    card: {
      first_6digits: string;
      last_4digits: string;
      issuer: string;
      country: string;
      type: string;
      token: string;
      expiry: string;
    };
    customer: {
      id: number;
      email: string;
      name: string;
    };
    status: string;
    payment_type: string;
    created_at: string;
    authorization?: {
      mode: string;
      endpoint: string;
    };
  };
}

interface ChargeTokenizedCardPayload {
  token: string;
  currency: string;
  amount: number;
  email: string;
  tx_ref: string;
  country?: string;
  redirect_url?: string;
}

export class FlutterwaveService {
  private client: AxiosInstance;
  private config: FlutterwaveConfig;

  constructor() {
    this.config = {
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
      secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
      encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || '',
      baseUrl: process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3',
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Log initialization
    logger.info('FlutterwaveService initialized', {
      hasPublicKey: !!this.config.publicKey,
      hasSecretKey: !!this.config.secretKey,
      baseUrl: this.config.baseUrl,
    });
  }

  /**
   * Encrypt card data using 3DES
   */
  private encrypt3DES(data: string): string {
    const key = CryptoJS.enc.Utf8.parse(this.config.encryptionKey);
    const encrypted = CryptoJS.TripleDES.encrypt(data, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  }

  /**
   * Tokenize a card (save for future use)
   * This charges a small amount (₦50) to verify and tokenize the card
   */
  async tokenizeCard(payload: ChargeCardPayload): Promise<TokenizeCardResponse> {
    try {
      logger.info('Tokenizing card', { tx_ref: payload.tx_ref });

      // Encrypt the payload
      const encryptedPayload = this.encrypt3DES(JSON.stringify(payload));

      const response = await this.client.post<TokenizeCardResponse>('/charges?type=card', {
        client: encryptedPayload,
      });

      logger.info('Card tokenization response', {
        status: response.data.status,
        message: response.data.message,
        dataStatus: response.data.data?.status,
        tx_ref: payload.tx_ref,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Card tokenization failed', {
        error: error.response?.data || error.message,
        tx_ref: payload.tx_ref,
      });
      throw new Error(error.response?.data?.message || 'Failed to tokenize card');
    }
  }

  /**
   * Validate card charge (submit OTP or other authorization)
   */
  async validateCharge(flwRef: string, otp: string): Promise<any> {
    try {
      logger.info('Validating charge', { flw_ref: flwRef });

      const response = await this.client.post('/validate-charge', {
        otp,
        flw_ref: flwRef,
      });

      logger.info('Charge validation response', {
        status: response.data.status,
        flw_ref: flwRef,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Charge validation failed', {
        error: error.response?.data || error.message,
        flw_ref: flwRef,
      });
      throw new Error(error.response?.data?.message || 'Failed to validate charge');
    }
  }

  /**
   * Charge a tokenized card
   */
  async chargeTokenizedCard(payload: ChargeTokenizedCardPayload): Promise<any> {
    try {
      logger.info('Charging tokenized card', { tx_ref: payload.tx_ref });

      // Add default redirect_url if not provided
      const chargePayload = {
        ...payload,
        redirect_url: payload.redirect_url || 'https://webhook.site/redirect',
      };

      const response = await this.client.post('/tokenized-charges', chargePayload);

      logger.info('Tokenized card charge response', {
        status: response.data.status,
        tx_ref: payload.tx_ref,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Tokenized card charge failed', {
        error: error.response?.data || error.message,
        tx_ref: payload.tx_ref,
      });
      throw new Error(error.response?.data?.message || 'Failed to charge card');
    }
  }

  /**
   * Verify a transaction
   */
  async verifyTransaction(transactionId: string): Promise<any> {
    try {
      logger.info('Verifying transaction', { transactionId });

      const response = await this.client.get(`/transactions/${transactionId}/verify`);

      logger.info('Transaction verification response', {
        status: response.data.status,
        transactionId,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Transaction verification failed', {
        error: error.response?.data || error.message,
        transactionId,
      });
      throw new Error(error.response?.data?.message || 'Failed to verify transaction');
    }
  }

  /**
   * Initiate a refund
   */
  async refundTransaction(transactionId: string, amount?: number): Promise<any> {
    try {
      logger.info('Initiating refund', { transactionId, amount });

      const payload: any = { id: transactionId };
      if (amount) {
        payload.amount = amount;
      }

      const response = await this.client.post('/transactions/refund', payload);

      logger.info('Refund initiated', {
        status: response.data.status,
        transactionId,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Refund failed', {
        error: error.response?.data || error.message,
        transactionId,
      });
      throw new Error(error.response?.data?.message || 'Failed to initiate refund');
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(transactionId: string): Promise<any> {
    try {
      const response = await this.client.get(`/transactions/${transactionId}`);
      return response.data;
    } catch (error: any) {
      logger.error('Get transaction failed', {
        error: error.response?.data || error.message,
        transactionId,
      });
      throw new Error(error.response?.data?.message || 'Failed to get transaction');
    }
  }

  /**
   * Validate webhook signature
   * TODO: Implement when webhook secret is configured
   */
  validateWebhookSignature(_signature: string, _payload: any): boolean {
    // Flutterwave webhook validation
    // Implementation depends on webhook secret setup
    return true; // Placeholder
  }
}
