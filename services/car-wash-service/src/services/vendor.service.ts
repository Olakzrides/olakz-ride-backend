import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { haversineDistanceKm } from '../utils/distance.util';
import {
  CarWashVendor,
  CreateVendorDto,
  UpdateVendorDto,
  SearchVendorsQuery,
  PaginatedResult,
  OperatingHours,
} from '../types';

const DEFAULT_OPERATING_HOURS: OperatingHours = {
  monday:    { open: '08:00', close: '19:00', closed: false },
  tuesday:   { open: '08:00', close: '19:00', closed: false },
  wednesday: { open: '08:00', close: '19:00', closed: false },
  thursday:  { open: '08:00', close: '19:00', closed: false },
  friday:    { open: '08:00', close: '19:00', closed: false },
  saturday:  { open: '08:00', close: '19:00', closed: false },
  sunday:    { open: '10:00', close: '17:00', closed: false },
};

export class VendorService {
  /**
   * Register a new car wash vendor (linked to the authenticated user).
   */
  async createVendor(userId: string, dto: CreateVendorDto): Promise<CarWashVendor> {
    const { data: existing } = await supabase
      .from('car_wash_vendors')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      throw new Error('You already have a registered vendor profile');
    }

    const operatingHours = { ...DEFAULT_OPERATING_HOURS, ...(dto.operatingHours ?? {}) };

    const { data, error } = await supabase
      .from('car_wash_vendors')
      .insert({
        user_id: userId,
        business_name: dto.businessName,
        description: dto.description ?? null,
        phone: dto.phone,
        email: dto.email ?? null,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        latitude: dto.latitude,
        longitude: dto.longitude,
        operating_hours: operatingHours,
        status: 'pending',
        rating: 0,
        total_customers: 0,
        total_hours_served: 0,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Create car wash vendor error:', error);
      throw new Error(`Failed to create vendor: ${error.message}`);
    }

    return this.mapRow(data);
  }

  /**
   * Fetch vendor profile by ID (includes services + stats for Profile screen).
   * Returns: cover, logo, businessName, tags, isOpenNow, operatingHoursDisplay,
   *          address, totalHoursServed, totalCustomers, rating, services[], reviews summary
   */
  async getVendorById(vendorId: string): Promise<CarWashVendor & { services: any[]; operatingHoursDisplay: string }> {
    const { data, error } = await supabase
      .from('car_wash_vendors')
      .select('*, car_wash_services(*)')
      .eq('id', vendorId)
      .single();

    if (error || !data) throw new Error('Vendor not found');

    const vendor = this.mapRow(data);
    const services = (data.car_wash_services ?? []).filter((s: any) => s.is_active);

    return {
      ...vendor,
      services,
      operatingHoursDisplay: this.formatOperatingHours(data.operating_hours ?? {}),
    };
  }

  /**
   * Get vendor profile owned by a user.
   */
  async getMyVendorProfile(userId: string): Promise<CarWashVendor> {
    const { data, error } = await supabase
      .from('car_wash_vendors')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new Error('Vendor profile not found');
    return this.mapRow(data);
  }

  /**
   * Update vendor profile (only owner).
   */
  async updateVendor(vendorId: string, userId: string, dto: UpdateVendorDto): Promise<CarWashVendor> {
    const { data: existing } = await supabase
      .from('car_wash_vendors')
      .select('id, user_id')
      .eq('id', vendorId)
      .single();

    if (!existing) throw new Error('Vendor not found');
    if (existing.user_id !== userId) throw new Error('Unauthorised: you do not own this vendor');

    const updatePayload: Record<string, any> = {};
    if (dto.businessName !== undefined) updatePayload.business_name = dto.businessName;
    if (dto.description !== undefined)  updatePayload.description = dto.description;
    if (dto.phone !== undefined)        updatePayload.phone = dto.phone;
    if (dto.email !== undefined)        updatePayload.email = dto.email;
    if (dto.address !== undefined)      updatePayload.address = dto.address;
    if (dto.city !== undefined)         updatePayload.city = dto.city;
    if (dto.state !== undefined)        updatePayload.state = dto.state;
    if (dto.latitude !== undefined)     updatePayload.latitude = dto.latitude;
    if (dto.longitude !== undefined)    updatePayload.longitude = dto.longitude;
    if (dto.operatingHours !== undefined) updatePayload.operating_hours = dto.operatingHours;

    const { data, error } = await supabase
      .from('car_wash_vendors')
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq('id', vendorId)
      .select('*')
      .single();

    if (error) throw new Error(`Update failed: ${error.message}`);
    return this.mapRow(data);
  }

  /**
   * Update vendor cover/logo images.
   */
  async updateVendorImages(
    vendorId: string,
    userId: string,
    images: { coverImageUrl?: string; logoUrl?: string }
  ): Promise<CarWashVendor> {
    const { data: existing } = await supabase
      .from('car_wash_vendors')
      .select('id, user_id')
      .eq('id', vendorId)
      .single();

    if (!existing) throw new Error('Vendor not found');
    if (existing.user_id !== userId) throw new Error('Unauthorised');

    const { data, error } = await supabase
      .from('car_wash_vendors')
      .update({ ...images, updated_at: new Date().toISOString() })
      .eq('id', vendorId)
      .select('*')
      .single();

    if (error) throw new Error(`Image update failed: ${error.message}`);
    return this.mapRow(data);
  }

  /**
   * Search vendors near a coordinate with optional filters.
   */
  async searchVendors(query: SearchVendorsQuery): Promise<PaginatedResult<CarWashVendor>> {
    const { latitude, longitude, radiusKm = 10, category, query: textQuery, page = 1, limit = 20 } = query;

    let dbQuery = supabase
      .from('car_wash_vendors')
      .select('*, car_wash_services!inner(id, category, is_active)', { count: 'exact' })
      .eq('status', 'approved')
      .eq('car_wash_services.is_active', true);

    if (category)   dbQuery = dbQuery.eq('car_wash_services.category', category);
    if (textQuery)  dbQuery = dbQuery.ilike('business_name', `%${textQuery}%`);

    const { data, error } = await dbQuery;
    if (error) throw new Error(`Search failed: ${error.message}`);

    const vendors = (data ?? [])
      .map((row: any) => {
        const vendor = this.mapRow(row);
        vendor.distanceKm = parseFloat(
          haversineDistanceKm(latitude, longitude, vendor.latitude, vendor.longitude).toFixed(2)
        );
        return vendor;
      })
      .filter((v) => v.distanceKm! <= radiusKm)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

    const total = vendors.length;
    const start = (page - 1) * limit;
    const paged = vendors.slice(start, start + limit);

    return {
      data: paged,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get top-rated vendors near coordinates.
   */
  async getTopRatedVendors(latitude: number, longitude: number, limit = 10): Promise<CarWashVendor[]> {
    const { data, error } = await supabase
      .from('car_wash_vendors')
      .select('*')
      .eq('status', 'approved')
      .order('rating', { ascending: false })
      .limit(50);

    if (error) throw new Error(`Failed to fetch top vendors: ${error.message}`);

    return (data ?? [])
      .map((row: any) => {
        const v = this.mapRow(row);
        v.distanceKm = parseFloat(
          haversineDistanceKm(latitude, longitude, v.latitude, v.longitude).toFixed(2)
        );
        return v;
      })
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }

  // ─── Private helpers ───────────────────────────────────────

  private mapRow(row: any): CarWashVendor {
    const hours: OperatingHours = row.operating_hours ?? DEFAULT_OPERATING_HOURS;
    return {
      id: row.id,
      userId: row.user_id,
      businessName: row.business_name,
      description: row.description,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      coverImageUrl: row.cover_image_url,
      logoUrl: row.logo_url,
      status: row.status,
      rating: parseFloat(row.rating) || 0,
      totalCustomers: row.total_customers ?? 0,
      totalHoursServed: row.total_hours_served ?? 0,
      operatingHours: hours,
      isOpenNow: this.checkIsOpen(hours),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private checkIsOpen(hours: OperatingHours): boolean {
    const now = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = dayNames[now.getDay()] as keyof OperatingHours;
    const dayConfig = hours[today];
    if (!dayConfig || dayConfig.closed) return false;

    const [openH, openM] = dayConfig.open.split(':').map(Number);
    const [closeH, closeM] = dayConfig.close.split(':').map(Number);
    const current = now.getHours() * 60 + now.getMinutes();
    return current >= openH * 60 + openM && current < closeH * 60 + closeM;
  }

  // ─── Store Details ─────────────────────────────────────────────────────────

  /**
   * GET /api/car-wash/vendor/store-details
   * Returns is_open, auto_accept_bookings, estimated_service_time_minutes
   */
  async getStoreDetails(userId: string) {
    const { data, error } = await supabase
      .from('car_wash_vendors')
      .select('id, is_open, auto_accept_bookings, estimated_service_time_minutes')
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new Error('Vendor profile not found');

    return {
      id:                           data.id,
      is_open:                      data.is_open          ?? false,
      auto_accept_bookings:         data.auto_accept_bookings ?? false,
      estimated_service_time_minutes: data.estimated_service_time_minutes ?? 30,
    };
  }

  /**
   * PUT /api/car-wash/vendor/store-details
   * Vendor toggles open/closed, auto-accept, default service time
   */
  async updateStoreDetails(userId: string, data: {
    is_open?: boolean;
    auto_accept_bookings?: boolean;
    estimated_service_time_minutes?: number;
  }) {
    const { data: existing } = await supabase
      .from('car_wash_vendors')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!existing) throw new Error('Vendor profile not found');

    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.is_open                      !== undefined) payload.is_open                      = data.is_open;
    if (data.auto_accept_bookings         !== undefined) payload.auto_accept_bookings         = data.auto_accept_bookings;
    if (data.estimated_service_time_minutes !== undefined) payload.estimated_service_time_minutes = data.estimated_service_time_minutes;

    const { data: updated, error } = await supabase
      .from('car_wash_vendors')
      .update(payload)
      .eq('user_id', userId)
      .select('id, is_open, auto_accept_bookings, estimated_service_time_minutes')
      .single();

    if (error) throw new Error(`Update failed: ${error.message}`);

    return {
      id:                           updated.id,
      is_open:                      updated.is_open,
      auto_accept_bookings:         updated.auto_accept_bookings,
      estimated_service_time_minutes: updated.estimated_service_time_minutes,
    };
  }

  // ─── Store Operations (operating hours) ───────────────────────────────────

  /**
   * GET /api/car-wash/vendor/store-operations
   * Returns operating_hours schedule per day
   */
  async getStoreOperations(userId: string) {
    const { data, error } = await supabase
      .from('car_wash_vendors')
      .select('id, operating_hours, is_open')
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new Error('Vendor profile not found');

    return {
      id:              data.id,
      is_open:         data.is_open ?? false,
      operating_hours: data.operating_hours ?? {},
    };
  }

  /**
   * PUT /api/car-wash/vendor/store-operations
   * Update operating hours and/or manual open toggle
   */
  async updateStoreOperations(userId: string, data: {
    operating_hours?: Record<string, any>;
    is_open?: boolean;
  }) {
    const { data: existing } = await supabase
      .from('car_wash_vendors')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!existing) throw new Error('Vendor profile not found');

    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.operating_hours !== undefined) payload.operating_hours = data.operating_hours;
    if (data.is_open         !== undefined) payload.is_open         = data.is_open;

    const { data: updated, error } = await supabase
      .from('car_wash_vendors')
      .update(payload)
      .eq('user_id', userId)
      .select('id, operating_hours, is_open')
      .single();

    if (error) throw new Error(`Update failed: ${error.message}`);

    return {
      id:              updated.id,
      is_open:         updated.is_open,
      operating_hours: updated.operating_hours,
    };
  }

  // ─── Statistics ────────────────────────────────────────────────────────────

  /**
   * GET /api/car-wash/vendor/statistics
   * Dashboard summary: total bookings, revenue, rating, this-month stats
   */
  async getStatistics(userId: string) {
    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('id, rating, total_customers, total_hours_served')
      .eq('user_id', userId)
      .single();

    if (!vendor) throw new Error('Vendor profile not found');

    const now       = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [allBookings, monthBookings] = await Promise.all([
      supabase
        .from('car_wash_bookings')
        .select('status, total_amount, payment_status')
        .eq('vendor_id', vendor.id),
      supabase
        .from('car_wash_bookings')
        .select('status, total_amount, payment_status')
        .eq('vendor_id', vendor.id)
        .gte('created_at', monthStart),
    ]);

    const all   = allBookings.data   ?? [];
    const month = monthBookings.data ?? [];

    const totalRevenue = all
      .filter((b: any) => b.status === 'completed' && b.payment_status === 'paid')
      .reduce((s: number, b: any) => s + parseFloat(b.total_amount ?? 0), 0);

    const monthRevenue = month
      .filter((b: any) => b.status === 'completed' && b.payment_status === 'paid')
      .reduce((s: number, b: any) => s + parseFloat(b.total_amount ?? 0), 0);

    return {
      total_bookings:     all.length,
      completed_bookings: all.filter((b: any) => b.status === 'completed').length,
      cancelled_bookings: all.filter((b: any) => b.status === 'cancelled').length,
      pending_bookings:   all.filter((b: any) => b.status === 'pending').length,
      total_revenue:      parseFloat(totalRevenue.toFixed(2)),
      average_rating:     parseFloat(vendor.rating) || 0,
      total_customers:    vendor.total_customers ?? 0,
      total_hours_served: parseFloat(vendor.total_hours_served) || 0,
      this_month: {
        bookings:   month.length,
        completed:  month.filter((b: any) => b.status === 'completed').length,
        revenue:    parseFloat(monthRevenue.toFixed(2)),
        cancelled:  month.filter((b: any) => b.status === 'cancelled').length,
      },
    };
  }

  /**
   * Produces "Mon-Sat | 8am - 7pm" for the vendor profile screen badge.
   */
  private formatOperatingHours(hours: Record<string, any>): string {
    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const labels: Record<string, string> = {
      monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
      friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
    };
    const openDays = dayKeys.filter((d) => hours[d] && !hours[d].closed);
    if (!openDays.length) return 'Closed';

    const first    = hours[openDays[0]];
    const openStr  = this.to12h(first?.open  ?? '08:00');
    const closeStr = this.to12h(first?.close ?? '19:00');
    const range    = openDays.length === 1
      ? labels[openDays[0]]
      : `${labels[openDays[0]]}-${labels[openDays[openDays.length - 1]]}`;

    return `${range} | ${openStr} - ${closeStr}`;
  }

  private to12h(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const suffix = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
  }
}
