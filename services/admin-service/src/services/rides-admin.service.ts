import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export interface RideFilters {
  status?: string;   // all | searching | driver_assigned | driver_arriving | driver_arrived | in_progress | completed | cancelled
  search?: string;   // search by customer name, driver name, pickup/dropoff address
  from?: string;     // ISO date
  to?: string;       // ISO date
  page?: number;
  limit?: number;
}

// Map DB status to dashboard-friendly label
function formatStatus(status: string): string {
  const map: Record<string, string> = {
    searching:          'Pending',
    driver_assigned:    'Accepted',
    driver_arriving:    'Accepted',
    driver_arrived:     'Arrived',
    in_progress:        'In Progress',
    completed:          'Completed',
    cancelled:          'Cancelled',
    scheduled:          'Pending',
    no_drivers_available: 'Cancelled',
  };
  return map[status] ?? status;
}

export class RidesAdminService {

  /**
   * Get ride status counts for the summary tabs.
   * Returns count per status group: all, pending, accepted, arrived, in_progress, completed, cancelled.
   */
  static async getStatusCounts(filters: { from?: string; to?: string } = {}) {
    let query = supabase
      .from('rides')
      .select('status', { count: 'exact' });

    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) {
      const toEnd = new Date(filters.to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      logger.error('getStatusCounts error', { error: error.message });
      return { all: 0, pending: 0, accepted: 0, arrived: 0, in_progress: 0, completed: 0, cancelled: 0 };
    }

    const rows = data ?? [];
    const counts = { all: rows.length, pending: 0, accepted: 0, arrived: 0, in_progress: 0, completed: 0, cancelled: 0 };

    for (const row of rows) {
      const label = formatStatus(row.status).toLowerCase().replace(' ', '_');
      if (label === 'pending')     counts.pending++;
      else if (label === 'accepted')   counts.accepted++;
      else if (label === 'arrived')    counts.arrived++;
      else if (label === 'in_progress') counts.in_progress++;
      else if (label === 'completed')  counts.completed++;
      else if (label === 'cancelled')  counts.cancelled++;
    }

    return counts;
  }

  /**
   * Get paginated list of rides with customer + driver names.
   * Supports status filter, date range filter, and search by name/address.
   */
  static async getRides(filters: RideFilters) {
    const { status, search, from, to, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    // Map dashboard status label to DB status values
    const statusMap: Record<string, string[]> = {
      pending:     ['searching', 'scheduled'],
      accepted:    ['driver_assigned', 'driver_arriving'],
      arrived:     ['driver_arrived'],
      in_progress: ['in_progress'],
      completed:   ['completed'],
      cancelled:   ['cancelled', 'no_drivers_available'],
    };

    let query = supabase
      .from('rides')
      .select(
        `id, user_id, driver_id, status, pickup_address, dropoff_address,
         estimated_fare, final_fare, payment_method, payment_status,
         booking_type, created_at, completed_at, cancelled_at,
         variant:ride_variants(title, vehicle_type:vehicle_types(name, display_name))`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Status filter
    if (status && status !== 'all') {
      const dbStatuses = statusMap[status.toLowerCase()];
      if (dbStatuses?.length) {
        query = query.in('status', dbStatuses);
      }
    }

    // Date range
    if (from) query = query.gte('created_at', from);
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    // Address search (before user/driver name search which needs post-processing)
    if (search) {
      query = query.or(
        `pickup_address.ilike.%${search}%,dropoff_address.ilike.%${search}%`
      );
    }

    const { data: rides, count, error } = await query;

    if (error) {
      logger.error('getRides error', { error: error.message });
      throw new Error(`Failed to fetch rides: ${error.message}`);
    }

    const rows = rides ?? [];

    // Collect user IDs (customers + drivers)
    const customerIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    const driverIds   = [...new Set(rows.map(r => r.driver_id).filter(Boolean))];

    // Fetch users (customers)
    const userMap = new Map<string, { first_name: string; last_name: string; phone: string }>();
    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone')
        .in('id', customerIds);
      for (const u of users ?? []) userMap.set(u.id, u);
    }

    // Fetch driver user IDs from drivers table
    const driverUserMap = new Map<string, string>(); // driverId → userId
    if (driverIds.length > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, user_id')
        .in('id', driverIds);
      for (const d of drivers ?? []) driverUserMap.set(d.id, d.user_id);
    }

    // Fetch driver user details
    const driverUserIds = [...new Set([...driverUserMap.values()])];
    const driverUserDetailMap = new Map<string, { first_name: string; last_name: string; phone: string }>();
    if (driverUserIds.length > 0) {
      const { data: driverUsers } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone')
        .in('id', driverUserIds);
      for (const u of driverUsers ?? []) driverUserDetailMap.set(u.id, u);
    }

    const formatted = rows.map((ride, idx) => {
      const customer = userMap.get(ride.user_id);
      const driverUserId = ride.driver_id ? driverUserMap.get(ride.driver_id) : null;
      const driverUser = driverUserId ? driverUserDetailMap.get(driverUserId) : null;

      const fare = ride.final_fare ?? ride.estimated_fare;
      const variant = ride.variant as any;

      return {
        sn: offset + idx + 1,
        id: ride.id,
        customer: customer
          ? { id: ride.user_id, name: `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(), phone: customer.phone }
          : { id: ride.user_id, name: 'Unknown', phone: null },
        driver: driverUser
          ? { id: ride.driver_id, name: `${driverUser.first_name ?? ''} ${driverUser.last_name ?? ''}`.trim(), phone: driverUser.phone }
          : ride.driver_id
            ? { id: ride.driver_id, name: 'Unassigned', phone: null }
            : null,
        pickup:  { address: ride.pickup_address },
        dropoff: { address: ride.dropoff_address },
        amount: {
          value:         parseFloat(fare ?? 0),
          paymentMethod: ride.payment_method,
          paymentStatus: ride.payment_status,
          display:       `₦${parseFloat(fare ?? 0).toLocaleString('en-NG')} · ${ride.payment_method}`,
        },
        vehicleType: variant?.vehicle_type?.display_name ?? variant?.title ?? null,
        status:    formatStatus(ride.status),
        rawStatus: ride.status,
        bookingType: ride.booking_type ?? 'for_me',
        createdAt:   ride.created_at,
        completedAt: ride.completed_at ?? null,
        cancelledAt: ride.cancelled_at ?? null,
      };
    });

    return {
      rides: formatted,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Get full details of a single ride (the "More" button).
   */
  static async getRideById(rideId: string) {
    const { data: ride, error } = await supabase
      .from('rides')
      .select(`
        *,
        variant:ride_variants(
          title, sku,
          vehicle_type:vehicle_types(name, display_name)
        )
      `)
      .eq('id', rideId)
      .single();

    if (error || !ride) return null;

    // Customer
    const { data: customer } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url')
      .eq('id', ride.user_id)
      .single();

    // Driver
    let driverInfo: any = null;
    if (ride.driver_id) {
      const { data: driver } = await supabase
        .from('drivers')
        .select(`
          id, user_id, rating, total_rides,
          vehicles:driver_vehicles(plate_number, manufacturer, model, color, is_active)
        `)
        .eq('id', ride.driver_id)
        .single();

      if (driver) {
        const { data: driverUser } = await supabase
          .from('users')
          .select('first_name, last_name, email, phone, avatar_url')
          .eq('id', driver.user_id)
          .single();

        const vehicles = (driver.vehicles as any[]) ?? [];
        const activeVehicle = vehicles.find(v => v.is_active) ?? vehicles[0] ?? null;

        driverInfo = {
          id:     driver.id,
          userId: driver.user_id,
          name:   driverUser ? `${driverUser.first_name ?? ''} ${driverUser.last_name ?? ''}`.trim() : 'Unknown',
          email:  driverUser?.email ?? null,
          phone:  driverUser?.phone ?? null,
          avatar: driverUser?.avatar_url ?? null,
          rating: parseFloat(driver.rating) || 0,
          totalRides: driver.total_rides,
          vehicle: activeVehicle ? {
            plateNumber:  activeVehicle.plate_number,
            manufacturer: activeVehicle.manufacturer,
            model:        activeVehicle.model,
            color:        activeVehicle.color,
          } : null,
        };
      }
    }

    const variant = ride.variant as any;
    const fare = ride.final_fare ?? ride.estimated_fare;

    return {
      id:         ride.id,
      status:     formatStatus(ride.status),
      rawStatus:  ride.status,
      bookingType: ride.booking_type ?? 'for_me',
      recipient: ride.booking_type === 'for_friend'
        ? { name: ride.recipient_name, phone: ride.recipient_phone }
        : null,
      customer: customer
        ? {
            id:     customer.id,
            name:   `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(),
            email:  customer.email,
            phone:  customer.phone,
            avatar: customer.avatar_url,
          }
        : { id: ride.user_id, name: 'Unknown', email: null, phone: null, avatar: null },
      driver: driverInfo,
      pickup:  { address: ride.pickup_address,  latitude: parseFloat(ride.pickup_latitude),  longitude: parseFloat(ride.pickup_longitude) },
      dropoff: { address: ride.dropoff_address, latitude: parseFloat(ride.dropoff_latitude), longitude: parseFloat(ride.dropoff_longitude) },
      route: {
        estimatedDistance: ride.estimated_distance ? `${ride.estimated_distance} km` : null,
        actualDistance:    ride.actual_distance    ? `${ride.actual_distance} km`    : null,
        estimatedDuration: ride.estimated_duration ? `${ride.estimated_duration} min` : null,
        actualDuration:    ride.actual_duration    ? `${ride.actual_duration} min`    : null,
      },
      amount: {
        estimated:     parseFloat(ride.estimated_fare ?? 0),
        final:         ride.final_fare ? parseFloat(ride.final_fare) : null,
        driverFare:    ride.driver_fare ? parseFloat(ride.driver_fare) : null,
        serviceFee:    ride.service_fee ? parseFloat(ride.service_fee) : null,
        roundingFee:   ride.rounding_fee ? parseFloat(ride.rounding_fee) : null,
        paymentMethod: ride.payment_method,
        paymentStatus: ride.payment_status,
      },
      vehicleType: variant?.vehicle_type?.display_name ?? variant?.title ?? null,
      ratings: {
        driverRating:    ride.driver_rating ?? null,
        driverFeedback:  ride.driver_feedback ?? null,
        passengerRating: ride.passenger_rating ?? null,
        passengerFeedback: ride.passenger_feedback ?? null,
      },
      scheduledAt:  ride.scheduled_at ?? null,
      startedAt:    ride.started_at ?? null,
      completedAt:  ride.completed_at ?? null,
      cancelledAt:  ride.cancelled_at ?? null,
      cancellationReason: ride.cancellation_reason ?? null,
      createdAt:    ride.created_at,
    };
  }
}
