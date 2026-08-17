/**
 * Discovery Service
 * Powers the customer-facing home screen:
 *  - Category chips
 *  - Top-rated vendors grid
 *  - Nearby vendors list
 *  - Search with filters
 */

import { supabase } from '../config/database';
import { haversineDistanceKm } from '../utils/distance.util';
import { WashCategory } from '../types';

// The fixed category catalogue shown as chips on the home screen
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
   * Returns the static category list for the home screen chips.
   */
  getCategories() {
    return CAR_WASH_CATEGORIES;
  }

  /**
   * Top-rated vendors near the customer's location.
   * Used for the "Top rated Car wash" horizontal grid.
   */
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
