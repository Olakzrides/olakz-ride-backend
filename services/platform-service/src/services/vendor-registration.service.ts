import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import Database from '../utils/database';
import logger from '../utils/logger';
import config from '../config';

const prisma = Database.getInstance();

// Supabase client for storage
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

const BUCKET = 'vendor-documents';

export interface VendorRegistrationInput {
  userId: string;
  business_name: string;
  business_type: string;
  email: string;
  phone: string;
  gender?: string;
  city?: string;
  state?: string;
  address?: string;
  service_type?: string;
}

export interface VendorDocumentsInput {
  userId: string;
  logo_url?: string;
  profile_picture_url?: string;
  nin_number?: string;
  cac_document_url?: string;
  store_images?: string[];
}

export class VendorRegistrationService {
  /**
   * Submit initial vendor registration
   */
  static async register(input: VendorRegistrationInput) {
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id, verification_status FROM vendors WHERE user_id = ${input.userId}::uuid LIMIT 1
    `;

    if (existing.length > 0) {
      const v = existing[0];
      if (v.verification_status === 'approved') {
        throw new Error('Vendor already registered and approved');
      }
      if (v.verification_status === 'pending') {
        throw new Error('Registration already submitted and pending review');
      }
      // rejected — allow re-registration: update existing record
      await prisma.$executeRaw`
        UPDATE vendors SET
          business_name = ${input.business_name},
          business_type = ${input.business_type},
          email = ${input.email},
          phone = ${input.phone},
          gender = ${input.gender ?? null},
          city = ${input.city ?? null},
          state = ${input.state ?? null},
          address = ${input.address ?? null},
          service_type = ${input.service_type ?? null},
          verification_status = 'pending',
          rejection_reason = NULL,
          updated_at = now()
        WHERE user_id = ${input.userId}::uuid
      `;
      return this.getByUserId(input.userId);
    }

    await prisma.$executeRaw`
      INSERT INTO vendors (user_id, business_name, business_type, email, phone, gender, city, state, address, service_type)
      VALUES (
        ${input.userId}::uuid,
        ${input.business_name},
        ${input.business_type},
        ${input.email},
        ${input.phone},
        ${input.gender ?? null},
        ${input.city ?? null},
        ${input.state ?? null},
        ${input.address ?? null},
        ${input.service_type ?? null}
      )
    `;

    return this.getByUserId(input.userId);
  }

  /**
   * Submit document URLs after frontend uploads to Supabase
   */
  static async submitDocuments(input: VendorDocumentsInput) {
    const existing = await this.getByUserId(input.userId);
    if (!existing) throw new Error('Vendor registration not found. Submit registration first.');

    // Build store_images clause separately — must use Postgres array literal format, not JSON
    const storeImagesClause = input.store_images && input.store_images.length > 0
      ? `store_images = ARRAY[${input.store_images.map((u) => `'${u.replace(/'/g, "''")}'`).join(',')}]::text[]`
      : `store_images = store_images`;

    await prisma.$executeRawUnsafe(`
      UPDATE vendors SET
        logo_url = COALESCE($1, logo_url),
        profile_picture_url = COALESCE($2, profile_picture_url),
        nin_number = COALESCE($3, nin_number),
        cac_document_url = COALESCE($4, cac_document_url),
        ${storeImagesClause},
        updated_at = now()
      WHERE user_id = $5::uuid
    `,
      input.logo_url ?? null,
      input.profile_picture_url ?? null,
      input.nin_number ?? null,
      input.cac_document_url ?? null,
      input.userId
    );

    return this.getByUserId(input.userId);
  }

  /**
   * Get vendor registration status
   */
  static async getStatus(userId: string) {
    const vendor = await this.getByUserId(userId);
    if (!vendor) return null;
    return {
      id: vendor.id,
      verification_status: vendor.verification_status,
      rejection_reason: vendor.rejection_reason,
      business_name: vendor.business_name,
      business_type: vendor.business_type,
      has_documents: !!(vendor.logo_url || vendor.nin_number || vendor.cac_document_url),
      created_at: vendor.created_at,
      updated_at: vendor.updated_at,
    };
  }

  /**
   * Generate signed upload URL for vendor documents
   */
  static async getSignedUploadUrl(userId: string, fileType: string, fileName: string): Promise<string> {
    await this.ensureBucket();
    const ext = fileName.split('.').pop() || 'jpg';
    const filePath = `${userId}/${fileType}/${uuidv4()}.${ext}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(filePath);

    if (error) throw new Error(`Failed to generate upload URL: ${error.message}`);
    return data.signedUrl;
  }

  /**
   * Admin: get all vendors with optional filters
   */
  static async adminGetAll(filters: { status?: string; business_type?: string; page?: number; limit?: number }) {
    const { status, business_type, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    if (status) conditions.push(`verification_status = '${status}'`);
    if (business_type) conditions.push(`business_type = '${business_type}'`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const vendors = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM vendors ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    );
    const countResult = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as total FROM vendors ${where}`
    );

    return {
      vendors,
      total: parseInt(countResult[0].total),
      page,
      limit,
    };
  }

  /**
   * Admin: approve vendor — also provisions food_restaurants row in food-service
   */
  static async adminApprove(vendorId: string, adminId: string) {
    const result = await prisma.$queryRaw<any[]>`
      UPDATE vendors SET
        verification_status = 'approved',
        approved_by = ${adminId}::uuid,
        approved_at = now(),
        rejection_reason = NULL,
        updated_at = now()
      WHERE id = ${vendorId}::uuid
      RETURNING *
    `;
    if (!result.length) throw new Error('Vendor not found');
    const vendor = result[0];

    // Auto-provision food_restaurants row for restaurant-type vendors
    // (non-blocking — log error but don't fail the approval)
    if (vendor.business_type === 'restaurant') {
      const foodServiceUrl = process.env.FOOD_SERVICE_URL || 'http://localhost:3005';
      const internalKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';
      try {
        await axios.post(
          `${foodServiceUrl}/api/internal/vendor/provision`,
          {
            user_id: vendor.user_id,
            business_name: vendor.business_name,
            address: vendor.address || '',
            city: vendor.city,
            state: vendor.state,
            phone: vendor.phone,
            email: vendor.email,
            logo_url: vendor.logo_url,
          },
          { headers: { 'x-internal-api-key': internalKey }, timeout: 8000 }
        );
        logger.info('Restaurant provisioned for vendor:', vendor.user_id);
      } catch (err: any) {
        logger.error('Failed to provision restaurant for vendor (non-fatal):', err.message);
      }
    }

    // Auto-provision marketplace_stores row for marketplace-type vendors
    if (vendor.business_type === 'marketplace') {
      const marketplaceServiceUrl = process.env.MARKETPLACE_SERVICE_URL || 'http://localhost:3006';
      const internalKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';
      try {
        await axios.post(
          `${marketplaceServiceUrl}/api/internal/marketplace/vendor/provision`,
          {
            owner_id: vendor.user_id,
            vendor_id: vendor.id,
            business_name: vendor.business_name,
            address: vendor.address || '',
            city: vendor.city,
            state: vendor.state,
            phone: vendor.phone,
            email: vendor.email,
            logo_url: vendor.logo_url,
          },
          { headers: { 'x-internal-api-key': internalKey }, timeout: 8000 }
        );
        logger.info('Marketplace store provisioned for vendor:', vendor.user_id);
      } catch (err: any) {
        logger.error('Failed to provision marketplace store for vendor (non-fatal):', err.message);
      }
    }

    return vendor;
  }

  /**
   * Admin: reject vendor
   */
  static async adminReject(vendorId: string, adminId: string, reason: string) {
    const result = await prisma.$queryRaw<any[]>`
      UPDATE vendors SET
        verification_status = 'rejected',
        rejection_reason = ${reason},
        approved_by = ${adminId}::uuid,
        updated_at = now()
      WHERE id = ${vendorId}::uuid
      RETURNING *
    `;
    if (!result.length) throw new Error('Vendor not found');
    return result[0];
  }

  /**
   * Check if vendor is approved (used by food-service middleware)
   */
  static async isApproved(userId: string): Promise<boolean> {
    const result = await prisma.$queryRaw<any[]>`
      SELECT verification_status FROM vendors WHERE user_id = ${userId}::uuid LIMIT 1
    `;
    return result.length > 0 && result[0].verification_status === 'approved';
  }

  static async getByUserId(userId: string) {
    const result = await prisma.$queryRaw<any[]>`
      SELECT * FROM vendors WHERE user_id = ${userId}::uuid LIMIT 1
    `;
    return result[0] ?? null;
  }

  private static async ensureBucket() {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 10 * 1024 * 1024 });
    }
  }
}
