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
import { WashCategory } from '../types';

// The fixed system category catalogue shown as chips on the home screen
export const CAR_WASH_CATEGORIES: Array<{
  key: WashCategory;
  label: string;
  icon: string;
}> = [
  { key: 'exterior_wash',  label: 'Exterior Wash',  icon: 'car-wash' },
  { key: 'interior_wash',  label: 'Interior Wash',  icon: 'car-seat' },
  { key: 'engine_wash',    label: 'Engine Wash',    icon: 'engine'   },
  { key: 'full_car_wash',  label: 'Full Car Wash',  icon: 'car-wash-full' },
  { key: 'car_vacuuming',  label: 'Car Vacuuming',  icon: 'vacuum'   },
  { key: 'wax_and_polish', label: 'Wax & Polish',   icon: 'sparkles' },
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
  primaryServiceLabel: string; // e.g. "Basic Wash"
  operatingHoursDisplay: string; // e.g. "Mon-Sat | 8am - 7pm"
}

export class DiscoveryService {
  /**
   * Returns system categories + all active custom categories from approved vendors.
   * Used for category chips / filter pills on the home screen.
   */
  async getCategories(): Promise<{
    systemCategories: Array<{ key: string; label: string; icon: string; type: 'system' }>;
    customCategories: Array<{ id: string; label: string; vendorId: string; vendorName: string; type: 'custom' }>;
  }> {
    // Fetch all active custom categories alongside the vendor's name
    const { data, error } = await supabase
      .from('car_wash_vendor_categories')
      .select('id, name, vendor_id, car_wash_vendors(business_name, status)')
      .eq('is_active', true);

    if (error) throw new Error(`Failed to fetch custom categories: ${error.message}`);

    // Only surface custom categories belonging to approved vendors
    const customCategories = (data ?? [])
      .filter((row: any) => row.car_wash_vendors?.status === 'approved')
      .map((row: any) => ({
        id:         row.id,
        label:      row.name,
        vendorId:   row.vendor_id,
        vendorName: row.car_wash_vendors?.business_name ?? '',
        type:       'custom' as const,
      }));

    return {
      systemCategories: CAR_WASH_CATEGORIES.map((c) => ({ ...c, type: 'system' as const })),
      customCategories,
    };
  }

  /**
   * Get all approved vendors (paginated).
   * Location is optional — when provided, vendors are sorted by distance.
   * When omitted, vendors are sorted by rating descending.
   */
  async getAllVendors(params: {
    latitude?: number;
    longitude?: number;
    category?: WashCategory | string;
    page?: number;
    limit?: number;
  }): Promise<{ vendors: VendorCard[]; total: number; page: number; totalPages: number }> {
    const { latitude, longitude, category, page = 1, limit = 20 } = params;
    const hasLocation = latitude !== undefined && longitude !== undefined;

    const { data, error } = await supabase
      .from('car_wash_vendors')
      .select('*, car_wash_services(name, category, is_active)')
      .eq('status', 'approved');

    if (error) throw new Error(`Failed to fetch vendors: ${error.message}`);

    let rows = data ?? [];

    // Apply category filter before formatting
    if (category) {
      rows = rows.filter((row: any) =>
        (row.car_wash_services ?? []).some(
          (s: any) => s.category === category && s.is_active
        )
      );
    }

    // Build VendorCards — distance is 0 when no location provided
    let vendors: VendorCard[] = rows.map((row: any) => {
      const distanceKm = hasLocation
        ? parseFloat(haversineDistanceKm(latitude!, longitude!, parseFloat(row.latitude), parseFloat(row.longitude)).toFixed(2))
        : 0;
      return this.toVendorCard(row, distanceKm);
    });

    // Sort: nearest-first when location provided, highest-rated when not
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
   * Returns two tiers:
   *  - topRatedAndNearby: high-rated vendors within a close radius, sorted by rating desc
   *  - others: remaining vendors outside that radius or lower-rated, sorted by distance
   *
   * For custom categories, matches via custom_category_id on services.
   * For system categories, matches via the category column on services.
   */
  async getVendorsByCategory(params: {
    category: string;           // system key OR custom category UUID
    categoryType: 'system' | 'custom';
    latitude?: number;
    longitude?: number;
    nearbyRadiusKm?: number;    // radius considered "nearby" — default 15km
    topRatedMinRating?: number; // minimum rating for top-rated tier — default 3.5
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

    // Fetch all approved vendors with their services
    const { data, error } = await supabase
      .from('car_wash_vendors')
      .select('*, car_wash_services(id, name, category, custom_category_id, is_active)')
      .eq('status', 'approved');

    if (error) throw new Error(`Failed to fetch vendors: ${error.message}`);

    // Filter to vendors that have at least one active service matching the category
    const matching = (data ?? []).filter((row: any) => {
      const services: any[] = (row.car_wash_services ?? []).filter((s: any) => s.is_active);
      if (categoryType === 'system') {
        return services.some((s) => s.category === category);
      } else {
        // custom category — match by UUID
        return services.some((s) => s.custom_category_id === category);
      }
    });

    // Build VendorCards with distance
    const cards: (VendorCard & { rawRating: number })[] = matching.map((row: any) => {
      const distanceKm = hasLocation
        ? parseFloat(haversineDistanceKm(latitude!, longitude!, parseFloat(row.latitude), parseFloat(row.longitude)).toFixed(2))
        : 0;
      return {
        ...this.toVendorCard(row, distanceKm),
        rawRating: parseFloat(row.rating) || 0,
      };
    });

    // Tier 1 — top-rated AND nearby (within nearbyRadiusKm, rating >= threshold)
    // If no location provided, just use rating threshold for this tier
    const topRatedAndNearby = cards
      .filter((v) =>
        v.rawRating >= topRatedMinRating &&
        (!hasLocation || v.distanceKm <= nearbyRadiusKm)
      )
      .sort((a, b) => b.rawRating - a.rawRating || a.distanceKm - b.distanceKm)
      .map(({ rawRating: _r, ...v }) => v);

    const topRatedIds = new Set(topRatedAndNearby.map((v) => v.id));

    // Tier 2 — everyone else
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
  async getTopRated(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    limit?: number;
  }): Promise<VendorCard[]> {
    const { latitude, longitude, radiusKm = 20, limit = 10 } = params;

    const { data, error } = await supabase
      .from('car_wash_vendors')
      .select('*, car_wash_services(name, category, is_active)')
      .eq('status', 'approved')
      .order('rating', { ascending: false })
      .limit(100); // fetch wide, then distance-filter

    if (error) throw new Error(`Failed to fetch top-rated vendors: ${error.message}`);

    return this.filterAndFormat(data ?? [], latitude, longitude, radiusKm, limit);
  }

  /**
   * Nearby vendors sorted by distance.
   * Used for the "Other nearby" list section.
   */
  async getNearby(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    category?: WashCategory;
    limit?: number;
    page?: number;
    excludeIds?: string[];
  }): Promise<{ vendors: VendorCard[]; total: number }> {
    const { latitude, longitude, radiusKm = 15, category, limit = 20, page = 1, excludeIds = [] } = params;

    let query = supabase
      .from('car_wash_vendors')
      .select('*, car_wash_services(name, category, is_active)')
      .eq('status', 'approved');

    if (excludeIds.length > 0) {
      query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch nearby vendors: ${error.message}`);

    let vendors = this.filterAndFormat(data ?? [], latitude, longitude, radiusKm, 1000);

    // Category filter (after enrichment)
    if (category) {
      vendors = vendors.filter((v) => {
        const raw = (data ?? []).find((r: any) => r.id === v.id);
        if (!raw) return false;
        return (raw.car_wash_services ?? []).some(
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
    category?: WashCategory;
    radiusKm?: number;
    page?: number;
    limit?: number;
  }): Promise<{ vendors: VendorCard[]; total: number }> {
    const { latitude, longitude, query: textQuery, category, radiusKm = 15, page = 1, limit = 20 } = params;

    let dbQuery = supabase
      .from('car_wash_vendors')
      .select('*, car_wash_services(name, category, is_active)')
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
        return (raw?.car_wash_services ?? []).some(
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
      .sort((a, b) => b.row.rating - a.row.rating) // top-rated first by default
      .slice(0, limit)
      .map(({ row, distanceKm }) => this.toVendorCard(row, distanceKm));
  }

  private toVendorCard(row: any, distanceKm: number): VendorCard {
    const services: any[] = (row.car_wash_services ?? []).filter((s: any) => s.is_active);
    const primaryServiceLabel = services[0]?.name ?? 'Car Wash';

    return {
      id:                   row.id,
      businessName:         row.business_name,
      coverImageUrl:        row.cover_image_url ?? null,
      logoUrl:              row.logo_url ?? null,
      rating:               parseFloat(row.rating) || 0,
      totalCustomers:       row.total_customers ?? 0,
      distanceKm,
      isOpenNow:            this.checkIsOpen(row.operating_hours ?? {}),
      city:                 row.city,
      state:                row.state,
      primaryServiceLabel,
      operatingHoursDisplay: this.formatOperatingHours(row.operating_hours ?? {}),
    };
  }

  private checkIsOpen(hours: Record<string, any>): boolean {
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[now.getDay()];
    const day = hours[today];
    if (!day || day.closed) return false;

    const [openH, openM] = (day.open ?? '00:00').split(':').map(Number);
    const [closeH, closeM] = (day.close ?? '00:00').split(':').map(Number);
    const current = now.getHours() * 60 + now.getMinutes();
    return current >= openH * 60 + openM && current < closeH * 60 + closeM;
  }

  /**
   * Produces a compact human-readable hours string like "Mon-Sat | 8am - 7pm"
   */
  private formatOperatingHours(hours: Record<string, any>): string {
    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels: Record<string, string> = {
      monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
      friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
    };

    // Find open days and their common hours
    const openDays = dayKeys.filter((d) => hours[d] && !hours[d].closed);
    if (openDays.length === 0) return 'Closed';

    // Get majority open/close time (most common pair)
    const first = hours[openDays[0]];
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
