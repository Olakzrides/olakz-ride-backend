import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export interface DeliveryFilters {
  status?: string;  // all | pending | accepted | in_progress | arrived | completed | cancelled
  search?: string;  // pickup/dropoff address, recipient name, order number
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    pending:              'Pending',
    searching:            'Pending',
    no_couriers_available: 'Cancelled',
    matching_failed:      'Cancelled',
    assigned:             'Accepted',
    arrived_pickup:       'Arrived',
    picked_up:            'In Progress',
    in_transit:           'In Progress',
    arrived_delivery:     'Arrived',
    delivered:            'Completed',
    cancelled:            'Cancelled',
  };
  return map[status] ?? status;
}

export class DeliveriesAdminService {

  /**
   * Status counts for the tab bar.
   */
  static async getStatusCounts(filters: { from?: string; to?: string } = {}) {
    let query = supabase.from('deliveries').select('status', { count: 'exact' });

    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) {
      const toEnd = new Date(filters.to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      logger.error('deliveries getStatusCounts error', { error: error.message });
      return { all: 0, pending: 0, accepted: 0, arrived: 0, in_progress: 0, completed: 0, cancelled: 0 };
    }

    const rows = data ?? [];
    const counts = { all: rows.length, pending: 0, accepted: 0, arrived: 0, in_progress: 0, completed: 0, cancelled: 0 };

    for (const row of rows) {
      const label = formatStatus(row.status).toLowerCase().replace(' ', '_');
      if (label === 'pending')      counts.pending++;
      else if (label === 'accepted')    counts.accepted++;
      else if (label === 'arrived')     counts.arrived++;
      else if (label === 'in_progress') counts.in_progress++;
      else if (label === 'completed')   counts.completed++;
      else if (label === 'cancelled')   counts.cancelled++;
    }

    return counts;
  }

  /**
   * Paginated delivery list with filters.
   */
  static async getDeliveries(filters: DeliveryFilters) {
    const { status, search, from, to, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    const statusMap: Record<string, string[]> = {
      pending:     ['pending', 'searching'],
      accepted:    ['assigned'],
      arrived:     ['arrived_pickup', 'arrived_delivery'],
      in_progress: ['picked_up', 'in_transit'],
      completed:   ['delivered'],
      cancelled:   ['cancelled', 'no_couriers_available', 'matching_failed'],
    };

    let query = supabase
      .from('deliveries')
      .select(
        `id, order_number, customer_id, courier_id, recipient_name, recipient_phone,
         pickup_address, dropoff_address, package_description,
         estimated_fare, final_fare, payment_method, payment_status,
         delivery_type, status, created_at, assigned_at, delivered_at, cancelled_at`,
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
        `pickup_address.ilike.%${search}%,dropoff_address.ilike.%${search}%,recipient_name.ilike.%${search}%,order_number.ilike.%${search}%`
      );
    }

    const { data: deliveries, count, error } = await query;

    if (error) {
      logger.error('getDeliveries error', { error: error.message });
      throw new Error(`Failed to fetch deliveries: ${error.message}`);
    }

    const rows = deliveries ?? [];

    // Customer IDs
    const customerIds = [...new Set(rows.map(r => r.customer_id).filter(Boolean))];
    const customerMap = new Map<string, { first_name: string; last_name: string; phone: string }>();
    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone')
        .in('id', customerIds);
      for (const u of users ?? []) customerMap.set(u.id, u);
    }

    // Courier IDs → user IDs
    const courierIds = [...new Set(rows.map(r => r.courier_id).filter(Boolean))];
    const courierUserMap = new Map<string, string>();
    if (courierIds.length > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, user_id')
        .in('id', courierIds);
      for (const d of drivers ?? []) courierUserMap.set(d.id, d.user_id);
    }

    const courierUserIds = [...new Set([...courierUserMap.values()])];
    const courierUserDetailMap = new Map<string, { first_name: string; last_name: string; phone: string }>();
    if (courierUserIds.length > 0) {
      const { data: courierUsers } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone')
        .in('id', courierUserIds);
      for (const u of courierUsers ?? []) courierUserDetailMap.set(u.id, u);
    }

    const formatted = rows.map((d, idx) => {
      const customer = customerMap.get(d.customer_id);
      const courierUserId = d.courier_id ? courierUserMap.get(d.courier_id) : null;
      const courierUser = courierUserId ? courierUserDetailMap.get(courierUserId) : null;
      const fare = d.final_fare ?? d.estimated_fare;

      return {
        sn: offset + idx + 1,
        id: d.id,
        orderNumber: d.order_number,
        customer: customer
          ? { id: d.customer_id, name: `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(), phone: customer.phone }
          : { id: d.customer_id, name: 'Unknown', phone: null },
        courier: courierUser
          ? { id: d.courier_id, name: `${courierUser.first_name ?? ''} ${courierUser.last_name ?? ''}`.trim(), phone: courierUser.phone }
          : d.courier_id
            ? { id: d.courier_id, name: 'Unassigned', phone: null }
            : null,
        recipient: { name: d.recipient_name, phone: d.recipient_phone },
        pickup:  { address: d.pickup_address },
        dropoff: { address: d.dropoff_address },
        package: { description: d.package_description ?? null },
        amount: {
          value:         parseFloat(fare ?? 0),
          paymentMethod: d.payment_method,
          paymentStatus: d.payment_status,
          display:       `₦${parseFloat(fare ?? 0).toLocaleString('en-NG')} · ${d.payment_method}`,
        },
        deliveryType: d.delivery_type,
        status:    formatStatus(d.status),
        rawStatus: d.status,
        createdAt:   d.created_at,
        assignedAt:  d.assigned_at ?? null,
        deliveredAt: d.delivered_at ?? null,
        cancelledAt: d.cancelled_at ?? null,
      };
    });

    return {
      deliveries: formatted,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Single delivery detail — the "More" button.
   */
  static async getDeliveryById(deliveryId: string) {
    const { data: d, error } = await supabase
      .from('deliveries')
      .select(`
        *,
        vehicle_type:vehicle_types(id, name, display_name)
      `)
      .eq('id', deliveryId)
      .single();

    if (error || !d) return null;

    // Customer
    const { data: customer } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url')
      .eq('id', d.customer_id)
      .single();

    // Courier
    let courierInfo: any = null;
    if (d.courier_id) {
      const { data: courier } = await supabase
        .from('drivers')
        .select(`id, user_id, rating, total_deliveries,
                 vehicles:driver_vehicles(plate_number, manufacturer, model, color, is_active)`)
        .eq('id', d.courier_id)
        .single();

      if (courier) {
        const { data: courierUser } = await supabase
          .from('users')
          .select('first_name, last_name, email, phone, avatar_url')
          .eq('id', courier.user_id)
          .single();

        const vehicles = (courier.vehicles as any[]) ?? [];
        const activeVehicle = vehicles.find(v => v.is_active) ?? vehicles[0] ?? null;

        courierInfo = {
          id:     courier.id,
          userId: courier.user_id,
          name:   courierUser ? `${courierUser.first_name ?? ''} ${courierUser.last_name ?? ''}`.trim() : 'Unknown',
          email:  courierUser?.email ?? null,
          phone:  courierUser?.phone ?? null,
          avatar: courierUser?.avatar_url ?? null,
          rating: parseFloat(courier.rating) || 0,
          totalDeliveries: courier.total_deliveries ?? 0,
          vehicle: activeVehicle ? {
            plateNumber:  activeVehicle.plate_number,
            manufacturer: activeVehicle.manufacturer,
            model:        activeVehicle.model,
            color:        activeVehicle.color,
          } : null,
        };
      }
    }

    const fare = d.final_fare ?? d.estimated_fare;
    const vt = d.vehicle_type as any;

    return {
      id:          d.id,
      orderNumber: d.order_number,
      status:      formatStatus(d.status),
      rawStatus:   d.status,
      deliveryType: d.delivery_type,
      customer: customer
        ? {
            id:     customer.id,
            name:   `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(),
            email:  customer.email,
            phone:  customer.phone,
            avatar: customer.avatar_url,
          }
        : { id: d.customer_id, name: 'Unknown', email: null, phone: null, avatar: null },
      courier: courierInfo,
      recipient: { name: d.recipient_name, phone: d.recipient_phone },
      pickup:  { address: d.pickup_address,  latitude: parseFloat(d.pickup_latitude),  longitude: parseFloat(d.pickup_longitude) },
      dropoff: { address: d.dropoff_address, latitude: parseFloat(d.dropoff_latitude), longitude: parseFloat(d.dropoff_longitude) },
      package: {
        description: d.package_description ?? null,
        photoUrl:    d.package_photo_url ?? null,
      },
      vehicleType: vt?.display_name ?? vt?.name ?? null,
      amount: {
        estimated:     parseFloat(d.estimated_fare ?? 0),
        final:         d.final_fare ? parseFloat(d.final_fare) : null,
        paymentMethod: d.payment_method,
        paymentStatus: d.payment_status,
        distanceKm:    d.distance_km ? parseFloat(d.distance_km) : null,
      },
      codes: {
        pickupCode:          d.pickup_code,
        deliveryCode:        d.delivery_code,
        pickupVerifiedAt:    d.pickup_code_verified_at ?? null,
        deliveryVerifiedAt:  d.delivery_code_verified_at ?? null,
      },
      proofOfDelivery: {
        pickupPhotoUrl:   d.pickup_photo_url ?? null,
        deliveryPhotoUrl: d.delivery_photo_url ?? null,
      },
      scheduledPickupAt:     d.scheduled_pickup_at ?? null,
      searchingAt:           d.searching_at ?? null,
      assignedAt:            d.assigned_at ?? null,
      courierArrivedPickupAt: d.courier_arrived_pickup_at ?? null,
      pickedUpAt:            d.picked_up_at ?? null,
      courierArrivedDeliveryAt: d.courier_arrived_delivery_at ?? null,
      deliveredAt:           d.delivered_at ?? null,
      cancelledAt:           d.cancelled_at ?? null,
      createdAt:             d.created_at,
    };
  }
}
