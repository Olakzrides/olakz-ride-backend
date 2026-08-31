import { supabase } from '../config/database';
import { logger } from '../config/logger';

export interface VendorCategory {
  id: string;
  vendorId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  serviceCount?: number;
  createdAt: string;
  updatedAt: string;
}

export class CategoryService {
  /**
   * Returns system categories + vendor's own custom categories combined.
   */
  async getAllCategoriesForVendor(vendorId: string): Promise<{
    systemCategories: Array<{ key: string; label: string; type: 'system' }>;
    customCategories: Array<{ id: string; name: string; type: 'custom'; serviceCount: number }>;
  }> {
    const SYSTEM_CATEGORIES = [
      { key: 'oil_change',        label: 'Oil Change',        type: 'system' as const },
      { key: 'tyre_service',      label: 'Tyre Service',      type: 'system' as const },
      { key: 'brake_service',     label: 'Brake Service',     type: 'system' as const },
      { key: 'engine_repair',     label: 'Engine Repair',     type: 'system' as const },
      { key: 'electrical_repair', label: 'Electrical Repair', type: 'system' as const },
      { key: 'general_service',   label: 'General Service',   type: 'system' as const },
    ];

    const customCategories = await this.getVendorCategories(vendorId, false);

    return {
      systemCategories: SYSTEM_CATEGORIES,
      customCategories:  customCategories.map(c => ({
        id:           c.id,
        name:         c.name,
        type:         'custom' as const,
        serviceCount: c.serviceCount ?? 0,
      })),
    };
  }

  /**
   * List all categories for a vendor.
   */
  async getVendorCategories(vendorId: string, includeInactive = false): Promise<VendorCategory[]> {
    let query = supabase
      .from('auto_mech_vendor_categories')
      .select('*, auto_mech_services(id, is_active)')
      .eq('vendor_id', vendorId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch categories: ${error.message}`);

    return (data ?? []).map((row: any) => ({
      id:           row.id,
      vendorId:     row.vendor_id,
      name:         row.name,
      description:  row.description,
      sortOrder:    row.sort_order,
      isActive:     row.is_active,
      serviceCount: (row.auto_mech_services ?? []).filter((s: any) => s.is_active).length,
      createdAt:    row.created_at,
      updatedAt:    row.updated_at,
    }));
  }

  /**
   * PUBLIC — customer-facing.
   * Returns a vendor's categories (system + custom) that have at least one
   * active service, with all active services listed under each category.
   * Used on the vendor profile screen so the customer can tap a category tab
   * and see the services underneath it.
   */
  async getVendorCategoriesForCustomer(vendorId: string): Promise<Array<{
    id: string;
    label: string;
    type: 'system' | 'custom';
    services: Array<{
      id: string;
      name: string;
      description: string | null;
      price: number | null;
      priceMin: number | null;
      priceMax: number | null;
      durationMinutes: number | null;
      category: string | null;
    }>;
  }>> {
    const { data: services, error } = await supabase
      .from('auto_mech_services')
      .select('*, auto_mech_vendor_categories(id, name)')
      .eq('vendor_id', vendorId)
      .eq('is_active', true);

    if (error) throw new Error(`Failed to fetch services: ${error.message}`);

    const allServices = services ?? [];

    const SYSTEM_CATEGORIES = [
      { key: 'oil_change',        label: 'Oil Change'        },
      { key: 'tyre_service',      label: 'Tyre Service'      },
      { key: 'brake_service',     label: 'Brake Service'     },
      { key: 'engine_repair',     label: 'Engine Repair'     },
      { key: 'electrical_repair', label: 'Electrical Repair' },
      { key: 'general_service',   label: 'General Service'   },
    ];

    const mapSvc = (s: any) => ({
      id:              s.id,
      name:            s.name,
      description:     s.description ?? null,
      price:           s.price           != null ? parseFloat(s.price)     : null,
      priceMin:        s.price_min       != null ? parseFloat(s.price_min) : null,
      priceMax:        s.price_max       != null ? parseFloat(s.price_max) : null,
      durationMinutes: s.duration_minutes ?? null,
      category:        s.category ?? null,
    });

    const result: Array<{ id: string; label: string; type: 'system' | 'custom'; services: any[] }> = [];

    // System categories — only those that have at least one active service
    for (const cat of SYSTEM_CATEGORIES) {
      const catServices = allServices
        .filter((s: any) => s.category === cat.key && !s.custom_category_id)
        .map(mapSvc);
      if (catServices.length > 0) {
        result.push({ id: cat.key, label: cat.label, type: 'system', services: catServices });
      }
    }

    // Custom categories — grouped by custom_category_id
    const customCatMap = new Map<string, { id: string; label: string; services: any[] }>();
    for (const s of allServices) {
      if (s.custom_category_id && (s as any).auto_mech_vendor_categories) {
        const cat = (s as any).auto_mech_vendor_categories;
        if (!customCatMap.has(cat.id)) {
          customCatMap.set(cat.id, { id: cat.id, label: cat.name, services: [] });
        }
        customCatMap.get(cat.id)!.services.push(mapSvc(s));
      }
    }
    for (const c of customCatMap.values()) {
      result.push({ ...c, type: 'custom' });
    }

    return result;
  }

  /**
   * Create a new custom category for a vendor.
   */
  async createCategory(vendorId: string, userId: string, dto: {
    name: string;
    description?: string;
    sortOrder?: number;
  }): Promise<VendorCategory> {
    const { data: vendor } = await supabase
      .from('auto_mech_vendors')
      .select('id, status')
      .eq('id', vendorId)
      .eq('user_id', userId)
      .single();

    if (!vendor) throw new Error('Vendor not found or you do not own this vendor');
    if (vendor.status !== 'approved') throw new Error('Vendor account must be approved before adding categories');

    const { data: existing } = await supabase
      .from('auto_mech_vendor_categories')
      .select('id')
      .eq('vendor_id', vendorId)
      .ilike('name', dto.name)
      .single();

    if (existing) throw new Error(`A category named "${dto.name}" already exists`);

    const { data, error } = await supabase
      .from('auto_mech_vendor_categories')
      .insert({
        vendor_id:   vendorId,
        name:        dto.name,
        description: dto.description ?? null,
        sort_order:  dto.sortOrder ?? 0,
        is_active:   true,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Create vendor category error:', error);
      throw new Error(`Failed to create category: ${error.message}`);
    }

    return this.mapRow(data);
  }

  /**
   * Update a vendor category (owner only).
   */
  async updateCategory(categoryId: string, vendorId: string, userId: string, dto: {
    name?: string;
    description?: string;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<VendorCategory> {
    await this.verifyOwnership(categoryId, vendorId, userId);

    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (dto.name        !== undefined) payload.name        = dto.name;
    if (dto.description !== undefined) payload.description = dto.description;
    if (dto.sortOrder   !== undefined) payload.sort_order  = dto.sortOrder;
    if (dto.isActive    !== undefined) payload.is_active   = dto.isActive;

    const { data, error } = await supabase
      .from('auto_mech_vendor_categories')
      .update(payload)
      .eq('id', categoryId)
      .select('*')
      .single();

    if (error) throw new Error(`Update failed: ${error.message}`);
    return this.mapRow(data);
  }

  /**
   * Soft-delete a category (sets is_active = false).
   */
  async deleteCategory(categoryId: string, vendorId: string, userId: string): Promise<VendorCategory> {
    await this.verifyOwnership(categoryId, vendorId, userId);

    const { data, error } = await supabase
      .from('auto_mech_vendor_categories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', categoryId)
      .select('*')
      .single();

    if (error) throw new Error(`Delete failed: ${error.message}`);
    return this.mapRow(data);
  }

  /**
   * Assign a service to a vendor custom category.
   */
  async assignServiceToCategory(
    serviceId: string,
    categoryId: string | null,
    vendorId: string,
    userId: string
  ): Promise<void> {
    const { data: service } = await supabase
      .from('auto_mech_services')
      .select('id, vendor_id')
      .eq('id', serviceId)
      .eq('vendor_id', vendorId)
      .single();

    if (!service) throw new Error('Service not found or does not belong to this vendor');

    if (categoryId !== null) {
      const { data: category } = await supabase
        .from('auto_mech_vendor_categories')
        .select('id')
        .eq('id', categoryId)
        .eq('vendor_id', vendorId)
        .single();

      if (!category) throw new Error('Category not found or does not belong to this vendor');
    }

    const { error } = await supabase
      .from('auto_mech_services')
      .update({ custom_category_id: categoryId, updated_at: new Date().toISOString() })
      .eq('id', serviceId);

    if (error) throw new Error(`Assignment failed: ${error.message}`);
  }

  /**
   * Get all services grouped by vendor category.
   */
  async getServicesGroupedByCategory(vendorId: string): Promise<{
    systemCategories: Array<{ key: string; label: string; services: any[] }>;
    customCategories: Array<{ id: string; name: string; services: any[] }>;
    uncategorised: any[];
  }> {
    const { data: services, error } = await supabase
      .from('auto_mech_services')
      .select('*, auto_mech_vendor_categories(id, name)')
      .eq('vendor_id', vendorId)
      .eq('is_active', true);

    if (error) throw new Error(`Failed to fetch services: ${error.message}`);

    const SYSTEM_CATEGORIES = [
      { key: 'oil_change',        label: 'Oil Change'        },
      { key: 'tyre_service',      label: 'Tyre Service'      },
      { key: 'brake_service',     label: 'Brake Service'     },
      { key: 'engine_repair',     label: 'Engine Repair'     },
      { key: 'electrical_repair', label: 'Electrical Repair' },
      { key: 'general_service',   label: 'General Service'   },
    ];

    const allServices = services ?? [];

    const systemCats = SYSTEM_CATEGORIES.map(cat => ({
      key:      cat.key,
      label:    cat.label,
      services: allServices.filter((s: any) => s.category === cat.key && !s.custom_category_id),
    })).filter(c => c.services.length > 0);

    const customCatMap = new Map<string, { id: string; name: string; services: any[] }>();
    for (const s of allServices) {
      if (s.custom_category_id && (s as any).auto_mech_vendor_categories) {
        const cat = (s as any).auto_mech_vendor_categories;
        if (!customCatMap.has(cat.id)) {
          customCatMap.set(cat.id, { id: cat.id, name: cat.name, services: [] });
        }
        customCatMap.get(cat.id)!.services.push(s);
      }
    }

    const uncategorised = allServices.filter(
      (s: any) => !s.custom_category_id && !SYSTEM_CATEGORIES.find(c => c.key === s.category)
    );

    return {
      systemCategories: systemCats,
      customCategories: [...customCatMap.values()],
      uncategorised,
    };
  }

  // ─── Private ─────────────────────────────────────────────

  private async verifyOwnership(categoryId: string, vendorId: string, userId: string): Promise<void> {
    const { data: vendor } = await supabase
      .from('auto_mech_vendors')
      .select('id')
      .eq('id', vendorId)
      .eq('user_id', userId)
      .single();

    if (!vendor) throw new Error('Vendor not found or unauthorised');

    const { data: category } = await supabase
      .from('auto_mech_vendor_categories')
      .select('id')
      .eq('id', categoryId)
      .eq('vendor_id', vendorId)
      .single();

    if (!category) throw new Error('Category not found or does not belong to this vendor');
  }

  private mapRow(row: any): VendorCategory {
    return {
      id:          row.id,
      vendorId:    row.vendor_id,
      name:        row.name,
      description: row.description,
      sortOrder:   row.sort_order,
      isActive:    row.is_active,
      createdAt:   row.created_at,
      updatedAt:   row.updated_at,
    };
  }
}
