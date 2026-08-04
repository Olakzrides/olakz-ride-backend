import { supabase } from '../config/database';
import { logger } from '../utils/logger';

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    pending:          'Pending',
    searching:        'Searching',
    driver_assigned:  'Accepted',
    driver_arrived:   'Arrived',
    in_progress:      'In Progress',
    completed:        'Completed',
    cancelled:        'Cancelled',
    no_driver_found:  'Cancelled',
  };
  return map[status] ?? status;
}

export interface HireFilters {
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export class HireAdminService {

  /**
   * Status counts for tab badges
   */
  static async getStatusCounts(filters: { from?: string; to?: string } = {}) {
    let query = supabase
      .from('transport_hires')
      .select('status');

    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) {
      const toEnd = new Date(filters.to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      logger.error('hire getStatusCounts error', { error: error.message });
      return { all: 0, pending: 0, searching: 0, accepted: 0, arrived: 0, in_progress: 0, completed: 0, cancelled: 0 };
    }

    const rows = data ?? [];
    const counts = { all: rows.length, pending: 0, searching: 0, accepted: 0, arrived: 0, in_progress: 0, completed: 0, cancelled: 0 };

    for (const row of rows) {
      const label = formatStatus(row.status).toLowerCase().replace(' ', '_');
      if      (label === 'pending')     counts.pending++;
      else if (label === 'searching')   counts.searching++;
      else if (label === 'accepted')    counts.accepted++;
      else if (label === 'arrived')     counts.arrived++;
      else if (label === 'in_progress') counts.in_progress++;
      else if (label === 'completed')   counts.completed++;
      else if (label === 'cancelled')   counts.cancelled++;
    }

    return counts;
  }

  /**
   * Paginated hire list with customer + driver info
   */
  static async getHires(filters: HireFilters) {
    const { status, search, from, to, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    const statusMap: Record<string, string[]> = {
      pending:     ['pending'],
      searching:   ['searching'],
      accepted:    ['driver_assigned'],
      arrived:     ['driver_arrived'],
      in_progress: ['in_progress'],
      completed:   ['completed'],
      cancelled:   ['cancelled', 'no_driver_found'],
    };

    let query = supabase
      .from('transport_hires')
      .select(
        `id, hire_number, customer_id, driver_id,
         vehicle_category, vehicle_sub_type,
         pickup_address, destination_address,
         start_datetime, end_datetime,
         amount, driver_fare, service_fee,
         payment_method, payment_status,
         status, created_at, updated_at`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      const dbStatuses = statusMap[status.toLowerCase()];
      if (dbStatuses?.length) query = query.in('status', dbStatuses);
    }

    if (from) query = query.gte('created_at', from);
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    if (search) {
      query = query.or(
        `pickup_address.ilike.%${search}%,destination_address.ilike.%${search}%,hire_number.ilike.%${search}%`
      );
    }

    const { data: hires, count, error } = await query;
    if (error) throw new Error(`Failed to fetch hires: ${error.message}`);

    const rows = hires ?? [];

    // Batch fetch customer names
    const customerIds = [...new Set(rows.map((r: any) => r.customer_id).filter(Boolean))];
    const customerMap = new Map<string, { name: string; phone: string | null }>();
    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone')
        .in('id', customerIds);
      for (const u of users ?? []) {
        customerMap.set(u.id, {
          name:  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown',
          phone: u.phone ?? null,
        });
      }
    }

    // Batch fetch driver names
    const driverIds = [...new Set(rows.map((r: any) => r.driver_id).filter(Boolean))];
    const driverMap = new Map<string, { name: string; phone: string | null }>();
    if (driverIds.length > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, user_id')
        .in('id', driverIds);

      const driverUserMap = new Map<string, string>();
      for (const d of drivers ?? []) driverUserMap.set(d.id, d.user_id);

      const driverUserIds = [...new Set([...driverUserMap.values()])];
      if (driverUserIds.length > 0) {
        const { data: driverUsers } = await supabase
          .from('users')
          .select('id, first_name, last_name, phone')
          .in('id', driverUserIds);

        const driverUserDetailMap = new Map<string, { name: string; phone: string | null }>();
        for (const u of driverUsers ?? []) {
          driverUserDetailMap.set(u.id, {
            name:  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown',
            phone: u.phone ?? null,
          });
        }
        for (const [driverId, userId] of driverUserMap.entries()) {
          const details = driverUserDetailMap.get(userId);
          if (details) driverMap.set(driverId, details);
        }
      }
    }

    const formatted = rows.map((hire: any, idx: number) => {
      const customer = customerMap.get(hire.customer_id);
      const driver   = hire.driver_id ? driverMap.get(hire.driver_id) : null;

      return {
        sn:          offset + idx + 1,
        id:          hire.id,
        hireNumber:  hire.hire_number,
        customer: {
          id:    hire.customer_id,
          name:  customer?.name  ?? 'Unknown',
          phone: customer?.phone ?? null,
        },
        driver: hire.driver_id ? {
          id:    hire.driver_id,
          name:  driver?.name  ?? 'Unknown',
          phone: driver?.phone ?? null,
        } : null,
        vehicleCategory: hire.vehicle_category,
        vehicleSubType:  hire.vehicle_sub_type ?? null,
        pickup:      { address: hire.pickup_address },
        destination: { address: hire.destination_address },
        schedule: {
          startDatetime: hire.start_datetime,
          endDatetime:   hire.end_datetime,
        },
        amount: {
          total:         parseFloat(hire.amount ?? 0),
          driverFare:    parseFloat(hire.driver_fare ?? 0),
          serviceFee:    parseFloat(hire.service_fee ?? 0),
          paymentMethod: hire.payment_method,
          paymentStatus: hire.payment_status,
          display:       `₦${parseFloat(hire.amount ?? 0).toLocaleString('en-NG')} · ${hire.payment_method}`,
        },
        status:      formatStatus(hire.status),
        rawStatus:   hire.status,
        createdAt:   hire.created_at,
        updatedAt:   hire.updated_at,
      };
    });

    return {
      hires: formatted,
      pagination: {
        page, limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Single hire detail with full driver earnings info
   */
  static async getHireById(hireId: string) {
    const { data: hire, error } = await supabase
      .from('transport_hires')
      .select('id, hire_number, customer_id, driver_id, vehicle_category, vehicle_sub_type, pickup_address, destination_address, start_datetime, end_datetime, amount, driver_fare, service_fee, rounding_fee, payment_method, payment_status, payment_hold_id, cash_payment_confirmed, for_whom, passenger_name, passenger_phone, note, status, cancellation_reason, created_at, updated_at')
      .eq('id', hireId)
      .single();

    if (error || !hire) return null;

    // Customer info
    const { data: customer } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url')
      .eq('id', hire.customer_id)
      .single();

    // Driver info
    let driverInfo: any = null;
    if (hire.driver_id) {
      const { data: driver } = await supabase
        .from('drivers')
        .select(`
          id, user_id, rating, total_rides, total_earnings, total_hire_earnings,
          vehicles:driver_vehicles(plate_number, manufacturer, model, color, is_active)
        `)
        .eq('id', hire.driver_id)
        .single();

      if (driver) {
        const { data: driverUser } = await supabase
          .from('users')
          .select('first_name, last_name, email, phone, avatar_url')
          .eq('id', driver.user_id)
          .single();

        const vehicles = (driver.vehicles as any[]) ?? [];
        const activeVehicle = vehicles.find((v: any) => v.is_active) ?? vehicles[0] ?? null;

        driverInfo = {
          id:               driver.id,
          userId:           driver.user_id,
          name:             driverUser ? `${driverUser.first_name ?? ''} ${driverUser.last_name ?? ''}`.trim() : 'Unknown',
          email:            driverUser?.email ?? null,
          phone:            driverUser?.phone ?? null,
          avatar:           driverUser?.avatar_url ?? null,
          rating:           parseFloat(String(driver.rating)) || 0,
          totalRides:       driver.total_rides ?? 0,
          totalEarnings:    parseFloat(String(driver.total_earnings ?? 0)),
          totalHireEarnings: parseFloat(String(driver.total_hire_earnings ?? 0)),
          vehicle: activeVehicle ? {
            plateNumber:  activeVehicle.plate_number,
            manufacturer: activeVehicle.manufacturer,
            model:        activeVehicle.model,
            color:        activeVehicle.color,
          } : null,
        };
      }
    }

    return {
      id:          hire.id,
      hireNumber:  hire.hire_number,
      status:      formatStatus(hire.status),
      rawStatus:   hire.status,
      vehicleCategory: hire.vehicle_category,
      vehicleSubType:  hire.vehicle_sub_type ?? null,
      customer: customer ? {
        id:     customer.id,
        name:   `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(),
        email:  customer.email,
        phone:  customer.phone,
        avatar: customer.avatar_url,
      } : { id: hire.customer_id, name: 'Unknown', email: null, phone: null, avatar: null },
      driver:      driverInfo,
      pickup:      { address: hire.pickup_address },
      destination: { address: hire.destination_address },
      schedule: {
        startDatetime: hire.start_datetime,
        endDatetime:   hire.end_datetime,
      },
      amount: {
        total:          parseFloat(hire.amount ?? 0),
        driverFare:     parseFloat(hire.driver_fare ?? 0),
        serviceFee:     parseFloat(hire.service_fee ?? 0),
        roundingFee:    parseFloat(hire.rounding_fee ?? 0),
        paymentMethod:  hire.payment_method,
        paymentStatus:  hire.payment_status,
        cashConfirmed:  hire.cash_payment_confirmed ?? false,
      },
      forWhom:           hire.for_whom,
      passengerName:     hire.passenger_name ?? null,
      passengerPhone:    hire.passenger_phone ?? null,
      notes:             hire.note ?? null,
      cancellationReason: hire.cancellation_reason ?? null,
      createdAt:   hire.created_at,
      updatedAt:   hire.updated_at,
    };
  }
}
