import { prisma } from '../config/database';
import logger from '../utils/logger';

export class InternalService {
  /**
   * Called by platform-service when a marketplace vendor is approved.
   * Creates marketplace_stores record (idempotent).
   */
  static async provisionVendor(data: {
    owner_id: string;
    vendor_id: string;
    business_name: string;
    address: string;
    latitude?: number;
    longitude?: number;
    phone?: string;
    email?: string;
    city?: string;
    state?: string;
    logo_url?: string;
  }) {
    const existing = await prisma.marketplaceStore.findUnique({ where: { ownerId: data.owner_id } });
    if (existing) {
      logger.info('Marketplace store already exists for vendor', { ownerId: data.owner_id });
      return existing;
    }

    const store = await prisma.marketplaceStore.create({
      data: {
        ownerId: data.owner_id,
        vendorId: data.vendor_id,
        name: data.business_name,
        address: data.address,
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        phone: data.phone || null,
        email: data.email || null,
        city: data.city || null,
        state: data.state || null,
        logoUrl: data.logo_url || null,
        isVerified: true,
      },
    });

    logger.info('Marketplace store provisioned for vendor', { ownerId: data.owner_id, storeId: store.id });
    return store;
  }
}
