/**
 * Discovery Service
 * Powers the customer-facing home screen:
 *  - Category chips (system + all vendor custom categories)
 *  - Top-rated vendors grid
 *  - Nearby vendors list
 *  - All vendors list
 *  - Search with filters
 */

import { supabase } from '../config/database';
import { haversineDistanceKm } from '../utils/distance.util';
import { MechCategory } from '../types';

// The fixed system category catalogue shown as chips on the home screen
export const AUTO_MECH_CATEGORIES: Array<{
  key: MechCategory;
  label: string;
  icon: string;
}> = [
  { key: 'oil_change',        label: 'Oil Change',        icon: 'oil-can'     },
  { key: 'tyre_service',      label: 'Tyre Service',      icon: 'tire'        },
  { key: 'brake_service',     label: 'Brake Service',     icon: 'brake-disc'  },
  { key: 'engine_repair',     label: 'Engine Repair',     icon: 'engine'      },
  { key: 'electrical_repair', label: 'Electrical Repair', icon: 'lightning'   },
  { key: 'general_service',   label: 'General Service',   icon: 'wrench'      },
];

export interface VendorCard {
  id: string;
  businessName: string;
  coverImageUrl: string | null;
  logoUrl: string | null;
  rating: number;
  totalCustomers: number;
  distanceKm: number;
  isOpenNow: boolean;
  city: string;
  state: string;
  primaryServiceLabel: string;
  priceRangeDisplay: string;       // e.g. "From ₦3,000" or "₦15,000 - ₦50,000"
  operatingHoursDisplay: string;
}

export class DiscoveryService {
  /**
   * Returns a flat merged list of all categories for the home screen chips:
   * system categories first, then unique custom categories from approved vendors.
   * Deduplicates custom categories by name so the same category name from
   * multiple vendors only appears once.
   */
  async getCategories(): Promise<Array<{
    id: string;           // system key or custom category UUID
    label: string;
    icon?: string;
    type: 'system' | 'custom';
  }>> {
    const { data, error } = await supabase
      .from('auto_mech_vendor_categories')
      .select('id, name, vendor_id, auto_mech_vendors(business_name, status)')
      .eq('is_active', true);

    if (error) throw new Error(`Failed to fetch custom categories: ${error.message}`);

    // Unique custom category names across all approved vendors
    const seenNames = new Set<string>();
    const customCategories: Array<{ id: string; label: string; type: 'custom' }> = [];

    for (const row of data ?? []) {
      if ((row as any).auto_mech_vendors?.status !== 'approved') continue;
      const name: string = (row as any).name;
      if (!seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        customCategories.push({ id: (row as any).id, label: name, type: 'custom' });
      }
    }

    return [
      ...AUTO_MECH_CATEGORIES.map((c) => ({ id: c.key, label: c.label, icon: c.icon, type: 'system' as const })),
      ...customCategories,
    ];
  }

  /**
   * Get all approved vendors (paginated).
   */
  async getAllVendors(params: {
    latitude?: number;
    longitude?: number;
    category?: MechCategory | string;
    page?: number;
    limit?: number;
  }): Promise<{ vendors: VendorCard[]; total: number; page: number; totalPages: number }> {
    const { latitude, longitude, category, page = 1, limit = 20 } = params;
    const hasLocation = latitude !== undefined && longitude !== undefined;

    const { data, error } = await supabase
      .from('auto_mech_vendors')
      .select('*, auto_mech_services(name, category, is_active, price, price_min, price_max)')
      .eq('status', 'approved');

    if (error) throw new Error(`Failed to fetch vendors: ${error.message}`);

    let rows = data ?? [];

    if (category) {
      rows = rows.filter((row: any) =>
        (row.auto_mech_services ?? []).some(
          (s: any) => s.category === category && s.is_active
        )
      );
    }

    let vendors: VendorCard[] = rows.map((row: any) => {
      const distanceKm = hasLocation
        ? parseFloat(haversineDistanceKm(latitude!, longitude!, parseFloat(row.latitude), parseFloat(row.longitude)).toFixed(2))
        : 0;
      return this.toVendorCard(row, distanceKm);
    });

    if (hasLocation) {
      vendors.sort((a, b) => a.distanceKm - b.distanceKm);
    } else {
      vendors.sort((a, b) => b.rating - a.rating);
    }

    const total = vendors.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;

    return {
      vendors: vendors.slice(start, start + limit),
      total,
      page,
      totalPages,
    };
  }

  /**
   * Get all vendors that offer a specific category (system or custom).
   */
  async getVendorsByCategory(params: {
    category: string;
    categoryType: 'system' | 'custom';
    latitude?: number;
    longitude?: number;
    nearbyRadiusKm?: number;
    topRatedMinRating?: number;
    page?: number;
    limit?: number;
  }): Promise<{
    topRatedAndNearby: VendorCard[];
    others: { vendors: VendorCard[]; total: number; page: number; totalPages: number };
  }> {
    const {
      category,
      categoryType,
      latitude,
      longitude,
      nearbyRadiusKm = 15,
      topRatedMinRating = 3.5,
      page = 1,
      limit = 20,
    } = params;

    const hasLocation = latitude !== undefined && longitude !== undefined;

    const { data, error } = await supabase
      .from('auto_mech_vendors')
      .select('*, auto_mech_services(id, name, category, custom_category_id, is_active, price, price_min, price_max)')
      .eq('status', 'approved');

    if (error) throw new Error(`Failed to fetch vendors: ${error.message}`);

    const matching = (data ?? []).filter((row: any) => {
      const services: any[] = (row.auto_mech_services ?? []).filter((s: any) => s.is_active);
      if (categoryType === 'system') {
        return services.some((s) => s.category === category);
      } else {
        return services.some((s) => s.custom_category_id === category);
      }
    });

    const cards: (VendorCard & { rawRating: number })[] = matching.map((row: any) => {
      const distanceKm = hasLocation
        ? parseFloat(haversineDistanceKm(latitude!, longitude!, parseFloat(row.latitude), parseFloat(row.longitude)).toFixed(2))
        : 0;
      return {
        ...this.toVendorCard(row, distanceKm),
        rawRating: parseFloat(row.rating) || 0,
      };
    });

    const topRatedAndNearby = cards
      .filter((v) =>
        v.rawRating >= topRatedMinRating &&
        (!hasLocation || v.distanceKm <= nearbyRadiusKm)
      )
      .sort((a, b) => b.rawRating - a.rawRating || a.distanceKm - b.distanceKm)
      .map(({ rawRating: _r, ...v }) => v);

    const topRatedIds = new Set(topRatedAndNearby.map((v) => v.id));

    const otherCards = cards
      .filter((v) => !topRatedIds.has(v.id))
      .sort((a, b) => a.distanceKm - b.distanceKm || b.rawRating - a.rawRating)
      .map(({ rawRating: _r, ...v }) => v);

    const total = otherCards.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;

    return {
      topRatedAndNearby,
      others: {
        vendors: otherCards.slice(start, start + limit),
        total,
        page,
        totalPages,
      },
    };
  }

  /**
   * Get top-rated vendors near coordinates.
   */
  async getTopRated(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    limit?: number;
  }): Promise<VendorCard[]> {
    const { latitude, longitude, radiusKm = 20, limit = 10 } = params;

    const { data, error } = await supabase
      .from('auto_mech_vendors')
      .select('*, auto_mech_services(name, category, is_active, price, price_min, price_max)')
      .eq('status', 'approved')
      .order('rating', { ascending: false })
      .limit(100);

    if (error) throw new Error(`Failed to fetch top-rated vendors: ${error.message}`);

    return this.filterAndFormat(data ?? [], latitude, longitude, radiusKm, limit);
  }

  /**
   * Nearby vendors sorted by distance.
   */
  async getNearby(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    category?: MechCategory;
    limit?: number;
    page?: number;
    excludeIds?: string[];
  }): Promise<{ vendors: VendorCard[]; total: number }> {
    const { latitude, longitude, radiusKm = 15, category, limit = 20, page = 1, excludeIds = [] } = params;

    let query = supabase
      .from('auto_mech_vendors')
      .select('*, auto_mech_services(name, category, is_active, price, price_min, price_max)')
      .eq('status', 'approved');

    if (excludeIds.length > 0) {
      query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch nearby vendors: ${error.message}`);

    let vendors = this.filterAndFormat(data ?? [], latitude, longitude, radiusKm, 1000);

    if (category) {
      vendors = vendors.filter((v) => {
        const raw = (data ?? []).find((r: any) => r.id === v.id);
        if (!raw) return false;
        return (raw.auto_mech_services ?? []).some(
          (s: any) => s.category === category && s.is_active
        );
      });
    }

    const total = vendors.length;
    const start = (page - 1) * limit;
    return { vendors: vendors.slice(start, start + limit), total };
  }

  /**
   * Full search — used when customer types in the search bar + applies filters.
   */
  async search(params: {
    latitude: number;
    longitude: number;
    query?: string;
    category?: MechCategory;
    radiusKm?: number;
    page?: number;
    limit?: number;
  }): Promise<{ vendors: VendorCard[]; total: number }> {
    const { latitude, longitude, query: textQuery, category, radiusKm = 15, page = 1, limit = 20 } = params;

    let dbQuery = supabase
      .from('auto_mech_vendors')
      .select('*, auto_mech_services(name, category, is_active, price, price_min, price_max)')
      .eq('status', 'approved');

    if (textQuery) {
      dbQuery = dbQuery.ilike('business_name', `%${textQuery}%`);
    }

    const { data, error } = await dbQuery;
    if (error) throw new Error(`Search failed: ${error.message}`);

    let vendors = this.filterAndFormat(data ?? [], latitude, longitude, radiusKm, 1000);

    if (category) {
      vendors = vendors.filter((v) => {
        const raw = (data ?? []).find((r: any) => r.id === v.id);
        return (raw?.auto_mech_services ?? []).some(
          (s: any) => s.category === category && s.is_active
        );
      });
    }

    const total = vendors.length;
    const start = (page - 1) * limit;
    return { vendors: vendors.slice(start, start + limit), total };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private filterAndFormat(
    rows: any[],
    latitude: number,
    longitude: number,
    radiusKm: number,
    limit: number
  ): VendorCard[] {
    return rows
      .map((row) => {
        const distanceKm = parseFloat(
          haversineDistanceKm(latitude, longitude, parseFloat(row.latitude), parseFloat(row.longitude)).toFixed(2)
        );
        return { row, distanceKm };
      })
      .filter(({ distanceKm }) => distanceKm <= radiusKm)
      .sort((a, b) => b.row.rating - a.row.rating)
      .slice(0, limit)
      .map(({ row, distanceKm }) => this.toVendorCard(row, distanceKm));
  }

  private toVendorCard(row: any, distanceKm: number): VendorCard {
    const services: any[] = (row.auto_mech_services ?? []).filter((s: any) => s.is_active);
    const primaryService       = services[0] ?? null;
    const primaryServiceLabel  = primaryService?.name ?? 'Auto Mech Service';

    // Build a human-readable price range from the cheapest active service
    let priceRangeDisplay = '';
    if (services.length > 0) {
      const sortedByPrice = [...services].sort(
        (a, b) => parseFloat(a.price_min ?? a.price ?? 0) - parseFloat(b.price_min ?? b.price ?? 0)
      );
      const cheapest = sortedByPrice[0];
      const minPrice = parseFloat(cheapest.price_min ?? cheapest.price ?? 0);
      const maxPrice = cheapest.price_max ? parseFloat(cheapest.price_max) : null;

      if (maxPrice && maxPrice > minPrice) {
        priceRangeDisplay = `₦${minPrice.toLocaleString('en-NG')} - ₦${maxPrice.toLocaleString('en-NG')}`;
      } else {
        priceRangeDisplay = `From ₦${minPrice.toLocaleString('en-NG')}`;
      }
    }

    return {
      id:                    row.id,
      businessName:          row.business_name,
      coverImageUrl:         row.cover_image_url ?? null,
      logoUrl:               row.logo_url ?? null,
      rating:                parseFloat(row.rating) || 0,
      totalCustomers:        row.total_customers ?? 0,
      distanceKm,
      isOpenNow:             this.checkIsOpen(row.operating_hours ?? {}),
      city:                  row.city,
      state:                 row.state,
      primaryServiceLabel,
      priceRangeDisplay,
      operatingHoursDisplay: this.formatOperatingHours(row.operating_hours ?? {}),
    };
  }

  private checkIsOpen(hours: Record<string, any>): boolean {
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[now.getDay()];
    const day = hours[today];
    if (!day || day.closed) return false;

    const [openH, openM]   = (day.open  ?? '00:00').split(':').map(Number);
    const [closeH, closeM] = (day.close ?? '00:00').split(':').map(Number);
    const current = now.getHours() * 60 + now.getMinutes();
    return current >= openH * 60 + openM && current < closeH * 60 + closeM;
  }

  private formatOperatingHours(hours: Record<string, any>): string {
    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels: Record<string, string> = {
      monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
      friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
    };

    const openDays = dayKeys.filter((d) => hours[d] && !hours[d].closed);
    if (openDays.length === 0) return 'Closed';

    const first    = hours[openDays[0]];
    const openStr  = this.to12h(first?.open  ?? '08:00');
    const closeStr = this.to12h(first?.close ?? '19:00');

    const firstLabel = dayLabels[openDays[0]];
    const lastLabel  = dayLabels[openDays[openDays.length - 1]];
    const dayRange   = openDays.length === 1
      ? firstLabel
      : `${firstLabel}-${lastLabel}`;

    return `${dayRange} | ${openStr} - ${closeStr}`;
  }

  private to12h(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const suffix = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
  }
}
