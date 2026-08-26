import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { CarWashService, CreateCarWashServiceDto, UpdateCarWashServiceDto } from '../types';

export class CarWashServiceService {
  /**
   * Add a new wash service/package to a vendor's profile.
   * Only the vendor owner can do this.
   */
  async createService(vendorId: string, userId: string, dto: CreateCarWashServiceDto): Promise<CarWashService> {
    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('id, user_id, status')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');
    if (vendor.user_id !== userId) throw new Error('Unauthorised: you do not own this vendor');
    if (vendor.status !== 'approved') throw new Error('Your vendor account must be approved before adding services');

    // If vendor provides a customCategoryId, system category is optional.
    // Only fall back to 'exterior_wash' when NEITHER category NOR customCategoryId is given.
    const customCategoryId = dto.customCategoryId ?? null;
    const systemCategory   = dto.category ?? (customCategoryId ? null : 'exterior_wash');

    // Verify the custom category belongs to this vendor before accepting it
    if (customCategoryId) {
      const { data: cat } = await supabase
        .from('car_wash_vendor_categories')
        .select('id')
        .eq('id', customCategoryId)
        .eq('vendor_id', vendorId)
        .eq('is_active', true)
        .single();

      if (!cat) throw new Error('Custom category not found or does not belong to this vendor');
    }

    const { data, error } = await supabase
      .from('car_wash_services')
      .insert({
        vendor_id:          vendorId,
        name:               dto.name,
        description:        dto.description ?? null,
        category:           systemCategory,
        duration_minutes:   dto.durationMinutes,
        price:              dto.price,
        is_active:          true,
        custom_category_id: customCategoryId,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Create car wash service error:', error);
      throw new Error(`Failed to create service: ${error.message}`);
    }

    return this.mapRow(data);
  }

  /**
   * List all active services for a vendor (public).
   */
  async getVendorServices(vendorId: string, includeInactive = false): Promise<CarWashService[]> {
    let query = supabase
      .from('car_wash_services')
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
  async getServiceById(serviceId: string): Promise<CarWashService> {
    const { data, error } = await supabase
      .from('car_wash_services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (error || !data) throw new Error('Service not found');
    return this.mapRow(data);
  }

  /**
   * Update a wash service (owner only).
   */
  async updateService(
    serviceId: string,
    vendorId: string,
    userId: string,
    dto: UpdateCarWashServiceDto
  ): Promise<CarWashService> {
    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('id, user_id')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');
    if (vendor.user_id !== userId) throw new Error('Unauthorised');

    const { data: service } = await supabase
      .from('car_wash_services')
      .select('id')
      .eq('id', serviceId)
      .eq('vendor_id', vendorId)
      .single();

    if (!service) throw new Error('Service not found or does not belong to this vendor');

    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (dto.name !== undefined)            updatePayload.name = dto.name;
    if (dto.description !== undefined)     updatePayload.description = dto.description;
    if (dto.category !== undefined)        updatePayload.category = dto.category;
    if (dto.durationMinutes !== undefined) updatePayload.duration_minutes = dto.durationMinutes;
    if (dto.price !== undefined)           updatePayload.price = dto.price;
    if (dto.isActive !== undefined)        updatePayload.is_active = dto.isActive;
    if (dto.customCategoryId !== undefined)
      updatePayload.custom_category_id = dto.customCategoryId ?? null;

    const { data, error } = await supabase
      .from('car_wash_services')
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
      .from('car_wash_vendors')
      .select('id, user_id')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');
    if (vendor.user_id !== userId) throw new Error('Unauthorised');

    const { error } = await supabase
      .from('car_wash_services')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', serviceId)
      .eq('vendor_id', vendorId);

    if (error) throw new Error(`Delete failed: ${error.message}`);
  }

  // ─── Private ─────────────────────────────────────────────

  /** Exposed for use in controller toggle handler to avoid an extra DB round-trip. */
  mapRowPublic(row: any): CarWashService {
    return this.mapRow(row);
  }

  private mapRow(row: any): CarWashService {
    return {
      id: row.id,
      vendorId: row.vendor_id,
      name: row.name,
      description: row.description,
      category: row.category,
      customCategoryId: row.custom_category_id ?? null,
      durationMinutes: row.duration_minutes,
      price: parseFloat(row.price),
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
