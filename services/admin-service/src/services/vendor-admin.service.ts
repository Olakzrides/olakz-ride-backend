import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import axios from 'axios';

export class VendorAdminService {
  static async getAll(filters: {
    status?: string;
    business_type?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, business_type, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('vendors')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('verification_status', status);
    if (business_type) query = query.eq('business_type', business_type);

    const { data: vendors, count, error } = await query;
    if (error) throw new Error(`Failed to get vendors: ${error.message}`);

    return { vendors: vendors || [], total: count || 0, page, limit };
  }

  static async approve(vendorId: string, adminId: string) {
    const { data: vendor, error } = await supabase
      .from('vendors')
      .update({
        verification_status: 'approved',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (error || !vendor) throw new Error('Vendor not found');

    const v = vendor as Record<string, unknown>;

    // Auto-provision food_restaurants for restaurant-type vendors (non-blocking)
    if (v.business_type === 'restaurant') {
      const foodServiceUrl = process.env.FOOD_SERVICE_URL || 'http://localhost:3005';
      const internalKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';
      axios.post(
        `${foodServiceUrl}/api/internal/vendor/provision`,
        {
          user_id: v.user_id,
          business_name: v.business_name,
          address: v.address || '',
          city: v.city,
          state: v.state,
          phone: v.phone,
          email: v.email,
          logo_url: v.logo_url,
        },
        { headers: { 'x-internal-api-key': internalKey }, timeout: 8000 }
      ).then(() => {
        logger.info('Restaurant provisioned for vendor', { userId: v.user_id });
      }).catch((err: unknown) => {
        logger.error('Failed to provision restaurant (non-fatal)', { error: err instanceof Error ? err.message : String(err) });
      });
    }

    // Auto-provision marketplace_stores for marketplace-type vendors (non-blocking)
    if (v.business_type === 'marketplace') {
      const marketplaceServiceUrl = process.env.MARKETPLACE_SERVICE_URL || 'http://localhost:3006';
      const internalKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';
      axios.post(
        `${marketplaceServiceUrl}/api/internal/marketplace/vendor/provision`,
        {
          owner_id: v.user_id,
          vendor_id: v.id,
          business_name: v.business_name,
          address: v.address || '',
          city: v.city,
          state: v.state,
          phone: v.phone,
          email: v.email,
          logo_url: v.logo_url,
        },
        { headers: { 'x-internal-api-key': internalKey }, timeout: 8000 }
      ).then(() => {
        logger.info('Marketplace store provisioned for vendor', { userId: v.user_id });
      }).catch((err: unknown) => {
        logger.error('Failed to provision marketplace store (non-fatal)', { error: err instanceof Error ? err.message : String(err) });
      });
    }

    return vendor;
  }

  static async reject(vendorId: string, adminId: string, reason: string) {
    const { data: vendor, error } = await supabase
      .from('vendors')
      .update({
        verification_status: 'rejected',
        rejection_reason: reason,
        approved_by: adminId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (error || !vendor) throw new Error('Vendor not found');
    return vendor;
  }

  static async getById(vendorId: string) {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (error || !data) return null;
    return data;
  }
}
