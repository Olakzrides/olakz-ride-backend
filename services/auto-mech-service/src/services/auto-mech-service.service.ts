import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { AutoMechService, CreateAutoMechServiceDto, UpdateAutoMechServiceDto } from '../types';

export class AutoMechServiceService {
  /**
   * Add a new service/package to a vendor's profile.
   */
  async createService(vendorId: string, userId: string, dto: CreateAutoMechServiceDto): Promise<AutoMechService> {
    const { data: vendor } = await supabase
      .from('auto_mech_vendors')
      .select('id, user_id, status')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');
    if (vendor.user_id !== userId) throw new Error('Unauthorised: you do not own this vendor');
    if (vendor.status !== 'approved') throw new Error('Your vendor account must be approved before adding services');

    const customCategoryId = dto.customCategoryId ?? null;
    const systemCategory   = dto.category ?? (customCategoryId ? null : 'general_service');

    if (customCategoryId) {
      const { data: cat } = await supabase
        .from('auto_mech_vendor_categories')
        .select('id')
        .eq('id', customCategoryId)
        .eq('vendor_id', vendorId)
        .eq('is_active', true)
        .single();

      if (!cat) throw new Error('Custom category not found or does not belong to this vendor');
    }

    // For range pricing: price_min defaults to price, price_max is optional.
    // price stays as the authoritative base price for backward compat.
    const priceMin = dto.priceMin ?? dto.price;
    const priceMax = dto.priceMax ?? null;

    const { data, error } = await supabase
      .from('auto_mech_services')
      .insert({
        vendor_id:          vendorId,
        name:               dto.name,
        description:        dto.description ?? null,
        category:           systemCategory,
        duration_minutes:   dto.durationMinutes,
        price:              dto.price,
        price_min:          priceMin,
        price_max:          priceMax,
        is_active:          true,
        custom_category_id: customCategoryId,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Create auto mech service error:', error);
      throw new Error(`Failed to create service: ${error.message}`);
    }

    return this.mapRow(data);
  }

  /**
   * List all active services for a vendor (public).
   */
  async getVendorServices(vendorId: string, includeInactive = false): Promise<AutoMechService[]> {
    let query = supabase
      .from('auto_mech_services')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('category', { ascending: true });

    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch services: ${error.message}`);

    return (data ?? []).map(this.mapRow);
  }

  /**
   * Get a single service by ID.
   */
  async getServiceById(serviceId: string): Promise<AutoMechService> {
    const { data, error } = await supabase
      .from('auto_mech_services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (error || !data) throw new Error('Service not found');
    return this.mapRow(data);
  }

  /**
   * Update a service (owner only).
   */
  async updateService(
    serviceId: string,
    vendorId: string,
    userId: string,
    dto: UpdateAutoMechServiceDto
  ): Promise<AutoMechService> {
    const { data: vendor } = await supabase
      .from('auto_mech_vendors')
      .select('id, user_id')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');
    if (vendor.user_id !== userId) throw new Error('Unauthorised');

    const { data: service } = await supabase
      .from('auto_mech_services')
      .select('id')
      .eq('id', serviceId)
      .eq('vendor_id', vendorId)
      .single();

    if (!service) throw new Error('Service not found or does not belong to this vendor');

    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (dto.name            !== undefined) updatePayload.name             = dto.name;
    if (dto.description     !== undefined) updatePayload.description      = dto.description;
    if (dto.category        !== undefined) updatePayload.category         = dto.category;
    if (dto.durationMinutes !== undefined) updatePayload.duration_minutes = dto.durationMinutes;
    if (dto.price           !== undefined) {
      updatePayload.price     = dto.price;
      // keep price_min in sync with price when price is updated and priceMin not explicitly set
      if (dto.priceMin === undefined) updatePayload.price_min = dto.price;
    }
    if (dto.priceMin !== undefined) updatePayload.price_min = dto.priceMin;
    if (dto.priceMax !== undefined) updatePayload.price_max = dto.priceMax; // null clears range → fixed price
    if (dto.isActive        !== undefined) updatePayload.is_active        = dto.isActive;
    if (dto.customCategoryId !== undefined)
      updatePayload.custom_category_id = dto.customCategoryId ?? null;

    const { data, error } = await supabase
      .from('auto_mech_services')
      .update(updatePayload)
      .eq('id', serviceId)
      .select('*')
      .single();

    if (error) throw new Error(`Update failed: ${error.message}`);
    return this.mapRow(data);
  }

  /**
   * Soft-delete a service (set is_active = false).
   */
  async deleteService(serviceId: string, vendorId: string, userId: string): Promise<void> {
    const { data: vendor } = await supabase
      .from('auto_mech_vendors')
      .select('id, user_id')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');
    if (vendor.user_id !== userId) throw new Error('Unauthorised');

    const { error } = await supabase
      .from('auto_mech_services')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', serviceId)
      .eq('vendor_id', vendorId);

    if (error) throw new Error(`Delete failed: ${error.message}`);
  }

  // ─── Private ─────────────────────────────────────────────

  mapRowPublic(row: any): AutoMechService {
    return this.mapRow(row);
  }

  private mapRow(row: any): AutoMechService {
    return {
      id:               row.id,
      vendorId:         row.vendor_id,
      name:             row.name,
      description:      row.description      ?? null,
      category:         row.category         ?? null,
      customCategoryId: row.custom_category_id ?? null,
      durationMinutes:  row.duration_minutes,
      price:            parseFloat(row.price),
      priceMin:         row.price_min != null ? parseFloat(row.price_min) : null,
      priceMax:         row.price_max != null ? parseFloat(row.price_max) : null,
      isActive:         row.is_active,
      createdAt:        row.created_at,
      updatedAt:        row.updated_at,
    };
  }
}
