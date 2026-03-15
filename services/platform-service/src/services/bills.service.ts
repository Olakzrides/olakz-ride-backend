import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import flutterwaveBillsService from './flutterwave-bills.service';
import walletIntegrationService from './wallet-integration.service';
import Database from '../utils/database';

const prisma = Database.getInstance();

interface PurchaseAirtimePayload {
  userId: string;
  phoneNumber: string;
  network: string;
  amount: number;
  paymentMethod: 'wallet' | 'card';
  cardId?: string;
}

interface PurchaseDataPayload {
  userId: string;
  phoneNumber: string;
  network: string;
  bundleCode: string;
  paymentMethod: 'wallet' | 'card';
  cardId?: string;
}

export class BillsService {
  /**
   * Get all available networks
   */
  async getNetworks() {
    try {
      logger.info('Fetching networks from database');

      const networks = await prisma.network_providers.findMany({
        where: { is_active: true },
        select: {
          id: true,
          name: true,
          code: true,
          logo_url: true,
          supports_airtime: true,
          supports_data: true,
        },
        orderBy: { name: 'asc' },
      });

      logger.info('Networks fetched successfully', { count: networks.length });

      return networks;
    } catch (error: any) {
      logger.error('Failed to fetch networks', { error: error.message });
      throw new Error('Failed to fetch networks');
    }
  }

  /**
   * Purchase airtime
   */
  async purchaseAirtime(payload: PurchaseAirtimePayload) {
    const { userId, phoneNumber, network, amount, paymentMethod, cardId } = payload;

    try {
      logger.info('Starting airtime purchase', {
        userId,
        phoneNumber,
        network,
        amount,
        paymentMethod,
      });

      // Validate amount
      if (amount < 50 || amount > 500000) {
        throw new Error('Amount must be between ₦50 and ₦500,000');
      }

      // Get network details
      const networkProvider = await prisma.network_providers.findUnique({
        where: { code: network.toLowerCase() },
      });

      if (!networkProvider || !networkProvider.is_active) {
        throw new Error('Invalid or inactive network');
      }

      if (!networkProvider.supports_airtime) {
        throw new Error('This network does not support airtime purchase');
      }

      // Generate unique reference
      const txRef = `olakz_airtime_${Date.now()}_${uuidv4().substring(0, 8)}`;

      // Create transaction record
      const transaction = await prisma.bill_transactions.create({
        data: {
          user_id: userId,
          transaction_type: 'airtime',
          network: networkProvider.name,
          phone_number: phoneNumber,
          amount,
          currency_code: 'NGN',
          payment_method: paymentMethod,
          payment_status: 'pending',
          flw_tx_ref: txRef,
          flw_biller_code: networkProvider.flw_biller_code,
          status: 'pending',
        },
      });

      logger.info('Transaction record created', {
        transactionId: transaction.id,
        txRef,
      });

      // Handle payment
      let walletTransactionId: string | undefined;
      let walletBalanceBefore: number | undefined;
      let walletBalanceAfter: number | undefined;

      if (paymentMethod === 'wallet') {
        // Check wallet balance
        const balance = await walletIntegrationService.getWalletBalance(userId, 'NGN');
        walletBalanceBefore = balance;

        if (balance < amount) {
          await prisma.bill_transactions.update({
            where: { id: transaction.id },
            data: {
              status: 'failed',
              payment_status: 'failed',
              error_message: 'Insufficient wallet balance',
              failed_at: new Date(),
              wallet_balance_before: walletBalanceBefore,
            },
          });

          throw new Error(`Insufficient wallet balance. Required: ₦${amount}, Available: ₦${balance}`);
        }

        // Deduct from wallet
        const walletDeduction = await walletIntegrationService.deductFromWallet({
          userId,
          amount,
          currencyCode: 'NGN',
          reference: txRef,
          description: `Airtime purchase - ${networkProvider.name} - ${phoneNumber}`,
        });

        walletTransactionId = walletDeduction.transaction.id;
        walletBalanceAfter = balance - amount;

        logger.info('Wallet deduction successful', {
          transactionId: transaction.id,
          walletTransactionId,
          balanceBefore: walletBalanceBefore,
          balanceAfter: walletBalanceAfter,
        });
      } else if (paymentMethod === 'card') {
        // TODO: Implement card payment via Flutterwave
        // For now, throw error
        throw new Error('Card payment not yet implemented');
      }

      // Purchase airtime via Flutterwave
      try {
        const flwResponse = await flutterwaveBillsService.purchaseAirtime({
          country: 'NG',
          customer: phoneNumber,
          amount,
          type: 'AIRTIME',
          reference: txRef,
          recurrence: 'ONCE',
        });

        // Update transaction with Flutterwave response
        const updatedTransaction = await prisma.bill_transactions.update({
          where: { id: transaction.id },
          data: {
            flw_reference: flwResponse.data?.reference || flwResponse.data?.flw_ref,
            flw_response: flwResponse,
            status: flwResponse.status === 'success' ? 'successful' : 'failed',
            payment_status: flwResponse.status === 'success' ? 'successful' : 'failed',
            wallet_transaction_id: walletTransactionId,
            wallet_balance_before: walletBalanceBefore,
            wallet_balance_after: walletBalanceAfter,
            completed_at: flwResponse.status === 'success' ? new Date() : null,
            failed_at: flwResponse.status !== 'success' ? new Date() : null,
            error_message: flwResponse.status !== 'success' ? flwResponse.message : null,
          },
        });

        logger.info('Airtime purchase completed', {
          transactionId: transaction.id,
          status: updatedTransaction.status,
          flwReference: updatedTransaction.flw_reference,
        });

        return {
          success: updatedTransaction.status === 'successful',
          transaction: {
            id: updatedTransaction.id,
            transaction_type: updatedTransaction.transaction_type,
            network: updatedTransaction.network,
            phone_number: updatedTransaction.phone_number,
            amount: Number(updatedTransaction.amount),
            status: updatedTransaction.status,
            flw_reference: updatedTransaction.flw_reference,
            created_at: updatedTransaction.created_at,
          },
          message: updatedTransaction.status === 'successful'
            ? 'Airtime purchase successful'
            : 'Airtime purchase failed',
        };
      } catch (flwError: any) {
        // Flutterwave failed — refund wallet if it was deducted
        if (walletTransactionId && paymentMethod === 'wallet') {
          try {
            await walletIntegrationService.refundToWallet({
              userId,
              amount,
              currencyCode: 'NGN',
              reference: `refund_${txRef}`,
              description: `Refund for failed airtime purchase - ${networkProvider.name} - ${phoneNumber}`,
            });
            logger.info('Wallet refund successful after Flutterwave failure', {
              transactionId: transaction.id,
              amount,
            });
          } catch (refundError: any) {
            logger.error('CRITICAL: Wallet refund failed after Flutterwave failure', {
              transactionId: transaction.id,
              userId,
              amount,
              refundError: refundError.message,
            });
          }
        }

        // Update transaction as failed
        await prisma.bill_transactions.update({
          where: { id: transaction.id },
          data: {
            status: 'failed',
            payment_status: 'failed',
            error_message: flwError.message,
            failed_at: new Date(),
            wallet_transaction_id: walletTransactionId,
            wallet_balance_before: walletBalanceBefore,
            wallet_balance_after: walletBalanceBefore, // restore to before since refunded
          },
        });

        logger.error('Flutterwave airtime purchase failed', {
          transactionId: transaction.id,
          error: flwError.message,
        });

        return {
          success: false,
          transaction: {
            id: transaction.id,
            transaction_type: transaction.transaction_type,
            network: transaction.network,
            phone_number: transaction.phone_number,
            amount: Number(transaction.amount),
            status: 'failed',
            flw_reference: null,
            created_at: transaction.created_at,
          },
          message: `Airtime purchase failed: ${flwError.message}`,
        };
      }
    } catch (error: any) {
      logger.error('Airtime purchase error', {
        userId,
        phoneNumber,
        network,
        amount,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get user transaction history
   */
  async getTransactionHistory(
    userId: string,
    page: number = 1,
    limit: number = 10,
    type?: 'airtime' | 'data'
  ) {
    try {
      logger.info('Fetching transaction history', { userId, page, limit, type });

      const skip = (page - 1) * limit;

      const where: any = { user_id: userId };
      if (type) {
        where.transaction_type = type;
      }

      const [transactions, total] = await Promise.all([
        prisma.bill_transactions.findMany({
          where,
          select: {
            id: true,
            transaction_type: true,
            network: true,
            phone_number: true,
            amount: true,
            bundle_name: true,
            bundle_validity: true,
            payment_method: true,
            status: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: limit,
        }),
        prisma.bill_transactions.count({ where }),
      ]);

      logger.info('Transaction history fetched', {
        userId,
        count: transactions.length,
        total,
      });

      return {
        transactions: transactions.map((t) => ({
          ...t,
          amount: Number(t.amount),
        })),
        total,
      };
    } catch (error: any) {
      logger.error('Failed to fetch transaction history', {
        userId,
        error: error.message,
      });
      throw new Error('Failed to fetch transaction history');
    }
  }

  /**
   * Get single transaction details
   */
  async getTransaction(transactionId: string, userId: string) {
    try {
      logger.info('Fetching transaction details', { transactionId, userId });

      const transaction = await prisma.bill_transactions.findFirst({
        where: {
          id: transactionId,
          user_id: userId,
        },
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      logger.info('Transaction details fetched', { transactionId });

      return {
        ...transaction,
        amount: Number(transaction.amount),
      };
    } catch (error: any) {
      logger.error('Failed to fetch transaction', {
        transactionId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  // ==========================================
  // PHASE 2: DATA BUNDLES
  // ==========================================

  /**
   * Get data bundles for a network (with 24hr cache)
   */
  async getDataBundles(networkCode: string, validityType?: string) {
    try {
      logger.info('Fetching data bundles', { networkCode, validityType });

      const network = await prisma.network_providers.findUnique({
        where: { code: networkCode.toLowerCase() },
      });

      if (!network || !network.is_active) {
        throw new Error('Invalid or inactive network');
      }

      if (!network.supports_data) {
        throw new Error('This network does not support data bundles');
      }

      // Check cache freshness (24 hours)
      const cacheExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const cachedCount = await prisma.data_bundles.count({
        where: {
          network_code: networkCode.toLowerCase(),
          is_active: true,
          last_synced_at: { gt: cacheExpiry },
        },
      });

      // Sync from Flutterwave if cache is empty or stale
      if (cachedCount === 0) {
        logger.info('Cache empty or stale, syncing from Flutterwave', { networkCode });
        const dataBillerCode = (network as any).flw_data_biller_code || network.flw_biller_code;
        await this.syncDataBundlesFromFlutterwave(networkCode.toLowerCase(), dataBillerCode);
      }

      // Fetch from cache
      const where: any = {
        network_code: networkCode.toLowerCase(),
        is_active: true,
      };
      if (validityType) {
        where.validity_type = validityType;
      }

      const bundles = await prisma.data_bundles.findMany({
        where,
        select: {
          id: true,
          bundle_code: true,
          bundle_name: true,
          amount: true,
          data_size: true,
          validity: true,
          validity_type: true,
          flw_item_code: true,
          last_synced_at: true,
        },
        orderBy: [{ sort_order: 'asc' }, { bundle_name: 'asc' }],
      });

      const lastSynced = bundles[0]?.last_synced_at || null;

      logger.info('Data bundles fetched', { networkCode, count: bundles.length });

      return {
        network: network.name,
        bundles: bundles.map((b) => ({ ...b, amount: Number(b.amount) })),
        last_synced_at: lastSynced,
      };
    } catch (error: any) {
      logger.error('Failed to fetch data bundles', { networkCode, error: error.message });
      throw error;
    }
  }

  /**
   * Sync data bundles from Flutterwave into the database cache
   */
  async syncDataBundlesFromFlutterwave(networkCode: string, billerCode: string) {
    try {
      logger.info('Syncing data bundles from Flutterwave', { networkCode, billerCode });

      const flwResponse = await flutterwaveBillsService.getDataBundles(billerCode);

      if (flwResponse.status !== 'success' || !Array.isArray(flwResponse.data)) {
        logger.warn('No data bundles returned from Flutterwave', { networkCode, billerCode, response: flwResponse });
        return;
      }

      logger.info('Flutterwave data bundles raw sample', {
        networkCode,
        sample: flwResponse.data.slice(0, 2),
      });

      const now = new Date();
      let sortOrder = 0;

      // Deduplicate by item_code (Flutterwave returns duplicates)
      const seen = new Set<string>();
      for (const item of flwResponse.data) {
        const itemCode: string = item.item_code;
        if (!itemCode || seen.has(itemCode)) continue;
        seen.add(itemCode);

        const bundleCode = `${networkCode}-${itemCode}`;
        const amount = parseFloat(item.amount) || 0;
        const bundleName: string = item.biller_name || item.short_name || item.name || bundleCode;
        const validityDays: string | null = item.validity_period ? `${item.validity_period} day(s)` : null;

        await prisma.data_bundles.upsert({
          where: { network_code_bundle_code: { network_code: networkCode, bundle_code: bundleCode } },
          update: {
            bundle_name: bundleName,
            amount,
            flw_item_code: itemCode,
            validity: validityDays,
            is_active: true,
            sort_order: sortOrder++,
            last_synced_at: now,
          },
          create: {
            network_code: networkCode,
            bundle_code: bundleCode,
            bundle_name: bundleName,
            amount,
            flw_item_code: itemCode,
            validity: validityDays,
            is_active: true,
            sort_order: sortOrder++,
            last_synced_at: now,
          },
        });
      }

      logger.info('Data bundles synced successfully', {
        networkCode,
        count: flwResponse.data.length,
      });
    } catch (error: any) {
      logger.error('Failed to sync data bundles from Flutterwave', {
        networkCode,
        billerCode,
        error: error.message,
      });
      // Don't throw — let the caller handle empty cache gracefully
    }
  }

  /**
   * Purchase data bundle
   */
  async purchaseData(payload: PurchaseDataPayload) {
    const { userId, phoneNumber, network, bundleCode, paymentMethod } = payload;

    try {
      logger.info('Starting data purchase', { userId, phoneNumber, network, bundleCode, paymentMethod });

      // Get network details
      const networkProvider = await prisma.network_providers.findUnique({
        where: { code: network.toLowerCase() },
      });

      if (!networkProvider || !networkProvider.is_active) {
        throw new Error('Invalid or inactive network');
      }

      if (!networkProvider.supports_data) {
        throw new Error('This network does not support data bundles');
      }

      // Get bundle details from cache
      const bundle = await prisma.data_bundles.findUnique({
        where: { network_code_bundle_code: { network_code: network.toLowerCase(), bundle_code: bundleCode } },
      });

      if (!bundle || !bundle.is_active) {
        throw new Error('Invalid or unavailable data bundle');
      }

      const amount = Number(bundle.amount);
      const txRef = `olakz_data_${Date.now()}_${uuidv4().substring(0, 8)}`;

      // Create transaction record
      const transaction = await prisma.bill_transactions.create({
        data: {
          user_id: userId,
          transaction_type: 'data',
          network: networkProvider.name,
          phone_number: phoneNumber,
          amount,
          currency_code: 'NGN',
          payment_method: paymentMethod,
          payment_status: 'pending',
          flw_tx_ref: txRef,
          flw_biller_code: (networkProvider as any).flw_data_biller_code || networkProvider.flw_biller_code,
          flw_item_code: bundle.flw_item_code,
          bundle_code: bundle.bundle_code,
          bundle_name: bundle.bundle_name,
          bundle_validity: bundle.validity,
          status: 'pending',
        },
      });

      logger.info('Data transaction record created', { transactionId: transaction.id, txRef });

      // Handle wallet payment
      let walletTransactionId: string | undefined;
      let walletBalanceBefore: number | undefined;

      if (paymentMethod === 'wallet') {
        const balance = await walletIntegrationService.getWalletBalance(userId, 'NGN');
        walletBalanceBefore = balance;

        if (balance < amount) {
          await prisma.bill_transactions.update({
            where: { id: transaction.id },
            data: {
              status: 'failed',
              payment_status: 'failed',
              error_message: 'Insufficient wallet balance',
              failed_at: new Date(),
              wallet_balance_before: walletBalanceBefore,
            },
          });
          throw new Error(`Insufficient wallet balance. Required: ₦${amount}, Available: ₦${balance}`);
        }

        const walletDeduction = await walletIntegrationService.deductFromWallet({
          userId,
          amount,
          currencyCode: 'NGN',
          reference: txRef,
          description: `Data bundle purchase - ${bundle.bundle_name} - ${phoneNumber}`,
        });

        walletTransactionId = walletDeduction.transaction.id;
        logger.info('Wallet deduction successful for data purchase', { transactionId: transaction.id, walletTransactionId });
      } else {
        throw new Error('Card payment not yet implemented');
      }

      // Purchase data via Flutterwave
      try {
        const flwResponse = await flutterwaveBillsService.purchaseData({
          country: 'NG',
          customer: phoneNumber,
          amount,
          type: 'DATA_BUNDLE',
          reference: txRef,
          biller_code: (networkProvider as any).flw_data_biller_code || networkProvider.flw_biller_code,
          item_code: bundle.flw_item_code,
          recurrence: 'ONCE',
        });

        const updatedTransaction = await prisma.bill_transactions.update({
          where: { id: transaction.id },
          data: {
            flw_reference: flwResponse.data?.reference || flwResponse.data?.flw_ref,
            flw_response: flwResponse,
            status: flwResponse.status === 'success' ? 'successful' : 'failed',
            payment_status: flwResponse.status === 'success' ? 'successful' : 'failed',
            wallet_transaction_id: walletTransactionId,
            wallet_balance_before: walletBalanceBefore,
            wallet_balance_after: walletBalanceBefore !== undefined ? walletBalanceBefore - amount : undefined,
            completed_at: flwResponse.status === 'success' ? new Date() : null,
            failed_at: flwResponse.status !== 'success' ? new Date() : null,
            error_message: flwResponse.status !== 'success' ? flwResponse.message : null,
          },
        });

        logger.info('Data purchase completed', {
          transactionId: transaction.id,
          status: updatedTransaction.status,
        });

        return {
          success: updatedTransaction.status === 'successful',
          transaction: {
            id: updatedTransaction.id,
            transaction_type: updatedTransaction.transaction_type,
            network: updatedTransaction.network,
            phone_number: updatedTransaction.phone_number,
            bundle_name: updatedTransaction.bundle_name,
            bundle_validity: updatedTransaction.bundle_validity,
            amount: Number(updatedTransaction.amount),
            status: updatedTransaction.status,
            flw_reference: updatedTransaction.flw_reference,
            created_at: updatedTransaction.created_at,
          },
          message: updatedTransaction.status === 'successful'
            ? 'Data bundle purchase successful'
            : 'Data bundle purchase failed',
        };
      } catch (flwError: any) {
        // Refund wallet on Flutterwave failure
        if (walletTransactionId && paymentMethod === 'wallet') {
          try {
            await walletIntegrationService.refundToWallet({
              userId,
              amount,
              currencyCode: 'NGN',
              reference: `refund_${txRef}`,
              description: `Refund for failed data purchase - ${bundle.bundle_name} - ${phoneNumber}`,
            });
            logger.info('Wallet refund successful after data purchase failure', { transactionId: transaction.id });
          } catch (refundError: any) {
            logger.error('CRITICAL: Wallet refund failed after data purchase failure', {
              transactionId: transaction.id,
              userId,
              amount,
              refundError: refundError.message,
            });
          }
        }

        // Detect Flutterwave test-mode limitation for data bundles
        const isTestModeLimitation = flwError.message?.toLowerCase().includes('invalid biller');
        const errorMessage = isTestModeLimitation
          ? 'Data bundle purchase is not supported in Flutterwave test mode. Switch to a live key to process data purchases.'
          : flwError.message;

        await prisma.bill_transactions.update({
          where: { id: transaction.id },
          data: {
            status: 'failed',
            payment_status: 'failed',
            error_message: errorMessage,
            failed_at: new Date(),
            wallet_transaction_id: walletTransactionId,
            wallet_balance_before: walletBalanceBefore,
            wallet_balance_after: walletBalanceBefore,
          },
        });

        logger.error('Flutterwave data purchase failed', {
          transactionId: transaction.id,
          error: flwError.message,
          isTestModeLimitation,
        });

        return {
          success: false,
          transaction: {
            id: transaction.id,
            transaction_type: transaction.transaction_type,
            network: transaction.network,
            phone_number: transaction.phone_number,
            bundle_name: transaction.bundle_name,
            bundle_validity: transaction.bundle_validity,
            amount: Number(transaction.amount),
            status: 'failed',
            flw_reference: null,
            created_at: transaction.created_at,
          },
          message: `Data bundle purchase failed: ${errorMessage}`,
        };
      }
    } catch (error: any) {
      logger.error('Data purchase error', { userId, phoneNumber, network, bundleCode, error: error.message });
      throw error;
    }
  }

  // ==========================================
  // PHASE 3: RETRY & RECEIPT
  // ==========================================

  /**
   * Retry a failed transaction (airtime or data)
   */
  async retryTransaction(transactionId: string, userId: string) {
    const transaction = await prisma.bill_transactions.findFirst({
      where: { id: transactionId, user_id: userId },
    });

    if (!transaction) throw new Error('Transaction not found');
    if (transaction.status !== 'failed') throw new Error('Only failed transactions can be retried');
    if (transaction.retry_count >= 3) throw new Error('Maximum retry attempts (3) reached');

    logger.info('Retrying transaction', { transactionId, type: transaction.transaction_type });

    // Increment retry count immediately
    await prisma.bill_transactions.update({
      where: { id: transaction.id },
      data: { retry_count: { increment: 1 }, status: 'pending', payment_status: 'pending' },
    });

    const newTxRef = `${transaction.flw_tx_ref}_retry${transaction.retry_count + 1}`;
    const amount = Number(transaction.amount);

    // Re-deduct wallet
    let walletTransactionId: string | undefined;
    try {
      const walletDeduction = await walletIntegrationService.deductFromWallet({
        userId,
        amount,
        currencyCode: 'NGN',
        reference: newTxRef,
        description: `Retry - ${transaction.transaction_type} purchase - ${transaction.network} - ${transaction.phone_number}`,
      });
      walletTransactionId = walletDeduction.transaction.id;
    } catch (err: any) {
      await prisma.bill_transactions.update({
        where: { id: transaction.id },
        data: { status: 'failed', payment_status: 'failed', error_message: err.message, failed_at: new Date() },
      });
      throw new Error(`Retry failed: ${err.message}`);
    }

    // Re-call Flutterwave
    try {
      let flwResponse: any;
      if (transaction.transaction_type === 'airtime') {
        flwResponse = await flutterwaveBillsService.purchaseAirtime({
          country: 'NG',
          customer: transaction.phone_number,
          amount,
          type: 'AIRTIME',
          reference: newTxRef,
          recurrence: 'ONCE',
        });
      } else {
        flwResponse = await flutterwaveBillsService.purchaseData({
          country: 'NG',
          customer: transaction.phone_number,
          amount,
          type: 'DATA_BUNDLE',
          reference: newTxRef,
          biller_code: transaction.flw_biller_code!,
          item_code: transaction.flw_item_code!,
          recurrence: 'ONCE',
        });
      }

      const isSuccess = flwResponse.status === 'success';
      const updated = await prisma.bill_transactions.update({
        where: { id: transaction.id },
        data: {
          flw_tx_ref: newTxRef,
          flw_reference: flwResponse.data?.reference || flwResponse.data?.flw_ref,
          flw_response: flwResponse,
          status: isSuccess ? 'successful' : 'failed',
          payment_status: isSuccess ? 'successful' : 'failed',
          wallet_transaction_id: walletTransactionId,
          completed_at: isSuccess ? new Date() : null,
          failed_at: !isSuccess ? new Date() : null,
          error_message: !isSuccess ? flwResponse.message : null,
        },
      });

      if (!isSuccess && walletTransactionId) {
        await walletIntegrationService.refundToWallet({
          userId,
          amount,
          currencyCode: 'NGN',
          reference: `refund_${newTxRef}`,
          description: `Refund for failed retry - ${transaction.network}`,
        });
      }

      return { success: isSuccess, transaction: updated };
    } catch (flwError: any) {
      if (walletTransactionId) {
        await walletIntegrationService.refundToWallet({
          userId,
          amount,
          currencyCode: 'NGN',
          reference: `refund_${newTxRef}`,
          description: `Refund for failed retry - ${transaction.network}`,
        }).catch((e: any) => logger.error('CRITICAL: Refund failed on retry', { transactionId, error: e.message }));
      }
      await prisma.bill_transactions.update({
        where: { id: transaction.id },
        data: { status: 'failed', payment_status: 'failed', error_message: flwError.message, failed_at: new Date() },
      });
      throw new Error(`Retry failed: ${flwError.message}`);
    }
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(transactionId: string, userId: string) {
    const transaction = await prisma.bill_transactions.findFirst({
      where: { id: transactionId, user_id: userId },
    });

    if (!transaction) throw new Error('Transaction not found');
    if (transaction.status !== 'successful') throw new Error('Receipt only available for successful transactions');

    return {
      receipt_number: `OLAKZ-${transaction.id.substring(0, 8).toUpperCase()}`,
      transaction_id: transaction.id,
      transaction_type: transaction.transaction_type,
      network: transaction.network,
      phone_number: transaction.phone_number,
      amount: Number(transaction.amount),
      currency: transaction.currency_code,
      bundle_name: transaction.bundle_name || null,
      bundle_validity: transaction.bundle_validity || null,
      payment_method: transaction.payment_method,
      flw_reference: transaction.flw_reference,
      status: transaction.status,
      completed_at: transaction.completed_at,
      issued_at: new Date().toISOString(),
    };
  }
}

export default new BillsService();
