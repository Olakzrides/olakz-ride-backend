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
   * GET /api/car-wash/vendor/categories/all
   * Returns system categories + vendor's own custom categories combined.
   * This is the full list the vendor sees when picking/managing categories.
   */
  async getAllCategoriesForVendor(vendorId: string): Promise<{
    systemCategories: Array<{ key: string; label: string; type: 'system' }>;
    customCategories: Array<{ id: string; name: string; type: 'custom'; serviceCount: number }>;
  }> {
    const SYSTEM_CATEGORIES = [
      { key: 'exterior_wash',  label: 'Exterior Wash',  type: 'system' as const },
      { key: 'interior_wash',  label: 'Interior Wash',  type: 'system' as const },
      { key: 'engine_wash',    label: 'Engine Wash',    type: 'system' as const },
      { key: 'full_car_wash',  label: 'Full Car Wash',  type: 'system' as const },
      { key: 'car_vacuuming',  label: 'Car Vacuuming',  type: 'system' as const },
      { key: 'wax_and_polish', label: 'Wax & Polish',   type: 'system' as const },
    ];

    const customCategories = await this.getVendorCategories(vendorId, false);

    return {
      systemCategories: SYSTEM_CATEGORIES,
      customCategories: customCategories.map(c => ({
        id:           c.id,
        name:         c.name,
        type:         'custom' as const,
        serviceCount: c.serviceCount ?? 0,
      })),
    };
  }

  /**
   * List all categories for a vendor (including inactive for owner).
   * Includes service count per category.
   */
  async getVendorCategories(vendorId: string, includeInactive = false): Promise<VendorCategory[]> {
    let query = supabase
      .from('car_wash_vendor_categories')
      .select('*, car_wash_services(id, is_active)')
      .eq('vendor_id', vendorId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch categories: ${error.message}`);

    return (data ?? []).map((row: any) => ({
      id:          row.id,
      vendorId:    row.vendor_id,
      name:        row.name,
      description: row.description,
      sortOrder:   row.sort_order,
      isActive:    row.is_active,
      serviceCount: (row.car_wash_services ?? []).filter((s: any) => s.is_active).length,
      createdAt:   row.created_at,
      updatedAt:   row.updated_at,
    }));
  }

  /**
   * Get a single category by ID.
   */
  async getCategoryById(categoryId: string): Promise<VendorCategory> {
    const { data, error } = await supabase
      .from('car_wash_vendor_categories')
      .select('*')
      .eq('id', categoryId)
      .single();

    if (error || !data) throw new Error('Category not found');
    return this.mapRow(data);
  }

  /**
   * Create a new custom category for a vendor.
   */
  async createCategory(vendorId: string, userId: string, dto: {
    name: string;
    description?: string;
    sortOrder?: number;
  }): Promise<VendorCategory> {
    // Verify vendor ownership
    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('id, status')
      .eq('id', vendorId)
      .eq('user_id', userId)
      .single();

    if (!vendor) throw new Error('Vendor not found or you do not own this vendor');
    if (vendor.status !== 'approved') throw new Error('Vendor account must be approved before adding categories');

    // Prevent duplicate names within the same vendor
    const { data: existing } = await supabase
      .from('car_wash_vendor_categories')
      .select('id')
      .eq('vendor_id', vendorId)
      .ilike('name', dto.name)
      .single();

    if (existing) throw new Error(`A category named "${dto.name}" already exists`);

    const { data, error } = await supabase
      .from('car_wash_vendor_categories')
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
      .from('car_wash_vendor_categories')
      .update(payload)
      .eq('id', categoryId)
      .select('*')
      .single();

    if (error) throw new Error(`Update failed: ${error.message}`);
    return this.mapRow(data);
  }

  /**
   * Soft-delete a category (sets is_active = false).
   * Returns the updated category so the caller can reflect the new state.
   * Services assigned to this category will have their custom_category_id set to NULL
   * (handled by ON DELETE SET NULL constraint).
   */
  async deleteCategory(categoryId: string, vendorId: string, userId: string): Promise<VendorCategory> {
    await this.verifyOwnership(categoryId, vendorId, userId);

    const { data, error } = await supabase
      .from('car_wash_vendor_categories')
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
    categoryId: string | null,   // null = unassign (use system category only)
    vendorId: string,
    userId: string
  ): Promise<void> {
    // Verify vendor owns the service
    const { data: service } = await supabase
      .from('car_wash_services')
      .select('id, vendor_id')
      .eq('id', serviceId)
      .eq('vendor_id', vendorId)
      .single();

    if (!service) throw new Error('Service not found or does not belong to this vendor');

    // If assigning, verify the category belongs to this vendor
    if (categoryId !== null) {
      const { data: category } = await supabase
        .from('car_wash_vendor_categories')
        .select('id')
        .eq('id', categoryId)
        .eq('vendor_id', vendorId)
        .single();

      if (!category) throw new Error('Category not found or does not belong to this vendor');
    }

    const { error } = await supabase
      .from('car_wash_services')
      .update({ custom_category_id: categoryId, updated_at: new Date().toISOString() })
      .eq('id', serviceId);

    if (error) throw new Error(`Assignment failed: ${error.message}`);
  }

  /**
   * Get all services grouped by vendor category (for dashboard overview).
   * System categories appear as-is; custom categories show their own services.
   */
  async getServicesGroupedByCategory(vendorId: string): Promise<{
    systemCategories: Array<{ key: string; label: string; services: any[] }>;
    customCategories: Array<{ id: string; name: string; services: any[] }>;
    uncategorised: any[];
  }> {
    const { data: services, error } = await supabase
      .from('car_wash_services')
      .select('*, car_wash_vendor_categories(id, name)')
      .eq('vendor_id', vendorId)
      .eq('is_active', true);

    if (error) throw new Error(`Failed to fetch services: ${error.message}`);

    const SYSTEM_CATEGORIES = [
      { key: 'exterior_wash', label: 'Exterior Wash' },
      { key: 'interior_wash', label: 'Interior Wash' },
      { key: 'engine_wash',   label: 'Engine Wash'   },
      { key: 'full_car_wash', label: 'Full Car Wash'  },
      { key: 'car_vacuuming', label: 'Car Vacuuming'  },
      { key: 'wax_and_polish',label: 'Wax & Polish'   },
    ];

    const allServices = services ?? [];

    // Services using system categories (no custom_category_id)
    const systemCats = SYSTEM_CATEGORIES.map(cat => ({
      key:      cat.key,
      label:    cat.label,
      services: allServices.filter((s: any) => s.category === cat.key && !s.custom_category_id),
    })).filter(c => c.services.length > 0);

    // Services assigned to vendor custom categories
    const customCatMap = new Map<string, { id: string; name: string; services: any[] }>();
    for (const s of allServices) {
      if (s.custom_category_id && (s as any).car_wash_vendor_categories) {
        const cat = (s as any).car_wash_vendor_categories;
        if (!customCatMap.has(cat.id)) {
          customCatMap.set(cat.id, { id: cat.id, name: cat.name, services: [] });
        }
        customCatMap.get(cat.id)!.services.push(s);
      }
    }

    // Services with no category assignment at all
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
      .from('car_wash_vendors')
      .select('id')
      .eq('id', vendorId)
      .eq('user_id', userId)
      .single();

    if (!vendor) throw new Error('Vendor not found or unauthorised');

    const { data: category } = await supabase
      .from('car_wash_vendor_categories')
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
