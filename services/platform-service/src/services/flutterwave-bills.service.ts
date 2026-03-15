import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';
import config from '../config';

interface FlutterwaveConfig {
  publicKey: string;
  secretKey: string;
  encryptionKey: string;
  baseUrl: string;
}

interface PurchaseAirtimePayload {
  country: string;
  customer: string;
  amount: number;
  type: string;
  reference: string;
  recurrence: string;
}

interface PurchaseDataPayload {
  country: string;
  customer: string;
  amount: number;
  type: string;
  reference: string;
  biller_code: string;
  item_code: string;
  recurrence: string;
}

interface FlutterwaveResponse {
  status: string;
  message: string;
  data: any;
}

export class FlutterwaveBillsService {
  private client: AxiosInstance;
  private config: FlutterwaveConfig;

  constructor() {
    this.config = {
      publicKey: config.flutterwave.publicKey,
      secretKey: config.flutterwave.secretKey,
      encryptionKey: config.flutterwave.encryptionKey,
      baseUrl: config.flutterwave.baseUrl,
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 seconds for bills payment
    });

    logger.info('FlutterwaveBillsService initialized', {
      hasPublicKey: !!this.config.publicKey,
      hasSecretKey: !!this.config.secretKey,
      baseUrl: this.config.baseUrl,
    });
  }

  /**
   * Get available billers (networks)
   */
  async getBillers(): Promise<any> {
    try {
      logger.info('Fetching billers from Flutterwave');

      const response = await this.client.get<FlutterwaveResponse>('/bill-categories');

      logger.info('Billers fetched successfully', {
        status: response.data.status,
        count: response.data.data?.length || 0,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to fetch billers', {
        error: error.response?.data || error.message,
        status: error.response?.status,
      });
      throw new Error(error.response?.data?.message || 'Failed to fetch billers');
    }
  }

  /**
   * Get data bundles for a specific biller
   */
  async getDataBundles(billerCode: string): Promise<any> {
    try {
      logger.info('Fetching data bundles', { billerCode });

      const response = await this.client.get<FlutterwaveResponse>(
        `/billers/${billerCode}/items`
      );

      logger.info('Data bundles fetched successfully', {
        billerCode,
        status: response.data.status,
        count: response.data.data?.length || 0,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to fetch data bundles', {
        billerCode,
        error: error.response?.data || error.message,
        status: error.response?.status,
      });
      throw new Error(error.response?.data?.message || 'Failed to fetch data bundles');
    }
  }

  /**
   * Purchase airtime
   */
  async purchaseAirtime(payload: PurchaseAirtimePayload): Promise<any> {
    try {
      logger.info('Purchasing airtime', {
        reference: payload.reference,
        customer: payload.customer,
        amount: payload.amount,
      });

      const response = await this.client.post<FlutterwaveResponse>('/bills', payload);

      logger.info('Airtime purchase response', {
        reference: payload.reference,
        status: response.data.status,
        message: response.data.message,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Airtime purchase failed', {
        reference: payload.reference,
        error: error.response?.data || error.message,
        status: error.response?.status,
      });
      throw new Error(error.response?.data?.message || 'Failed to purchase airtime');
    }
  }

  /**
   * Purchase data bundle
   */
  async purchaseData(payload: PurchaseDataPayload): Promise<any> {
    try {
      logger.info('Purchasing data bundle', {
        reference: payload.reference,
        customer: payload.customer,
        amount: payload.amount,
        billerCode: payload.biller_code,
        itemCode: payload.item_code,
      });

      const response = await this.client.post<FlutterwaveResponse>('/bills', payload);

      logger.info('Data purchase response', {
        reference: payload.reference,
        status: response.data.status,
        message: response.data.message,
      });

      return response.data;
    } catch (error: any) {
      const errMsg: string = error.response?.data?.message || error.message || 'Failed to purchase data';
      logger.error('Data purchase failed', {
        reference: payload.reference,
        error: error.response?.data || error.message,
        status: error.response?.status,
      });
      // Preserve the original Flutterwave error message for upstream handling
      const err = new Error(errMsg);
      (err as any).flwStatus = error.response?.status;
      (err as any).flwData = error.response?.data;
      throw err;
    }
  }

  /**
   * Verify a bill payment transaction
   */
  async verifyTransaction(reference: string): Promise<any> {
    try {
      logger.info('Verifying bill transaction', { reference });

      const response = await this.client.get<FlutterwaveResponse>(`/bills/${reference}`);

      logger.info('Transaction verification response', {
        reference,
        status: response.data.status,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Transaction verification failed', {
        reference,
        error: error.response?.data || error.message,
        status: error.response?.status,
      });
      throw new Error(error.response?.data?.message || 'Failed to verify transaction');
    }
  }
}

export default new FlutterwaveBillsService();
