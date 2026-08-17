import { supabase } from '../config/database';
import { config } from '../config/env';
import { DayAvailability, TimeSlot, OperatingHours } from '../types';

export class AvailabilityService {
  /**
   * Get available time slots for a vendor + service on a given date.
   *
   * Logic:
   *  1. Check vendor operating hours for the requested day.
   *  2. Generate slots every SLOT_DURATION minutes within open hours.
   *  3. Remove slots that conflict with existing confirmed/pending bookings.
   *  4. Remove slots in the past (today).
   */
  async getAvailableSlots(
    vendorId: string,
    serviceId: string,
    dateStr: string   // "YYYY-MM-DD"
  ): Promise<DayAvailability> {
    // 1. Fetch vendor operating hours + service duration
    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('operating_hours')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');

    const { data: service } = await supabase
      .from('car_wash_services')
      .select('duration_minutes')
      .eq('id', serviceId)
      .eq('vendor_id', vendorId)
      .single();

    if (!service) throw new Error('Service not found');

    const operatingHours: OperatingHours = vendor.operating_hours;
    const durationMin: number = service.duration_minutes;
    const slotDuration = config.booking.slotDurationMinutes; // 30 min slots

    // 2. Map date to day-of-week
    const date = new Date(dateStr + 'T00:00:00');
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[date.getDay()] as keyof OperatingHours;
    const dayConfig = operatingHours[dayName];

    if (!dayConfig || dayConfig.closed) {
      return {
        date: dateStr,
        displayDate: this.formatDisplayDate(date),
        slots: [],
      };
    }

    // 3. Generate all candidate slots
    const allSlots = this.generateSlots(dayConfig.open, dayConfig.close, slotDuration, durationMin);

    // 4. Fetch existing bookings on that day
    const dayStart = dateStr + 'T00:00:00.000Z';
    const dayEnd = dateStr + 'T23:59:59.999Z';

    const { data: bookings } = await supabase
      .from('car_wash_bookings')
      .select('scheduled_at, service_id')
      .eq('vendor_id', vendorId)
      .in('status', ['pending', 'confirmed', 'in_progress'])
      .gte('scheduled_at', dayStart)
      .lte('scheduled_at', dayEnd);

    // Build set of booked start times (minutes from midnight)
    const bookedMinutes = new Set<number>();
    for (const b of bookings ?? []) {
      const bookedDate = new Date(b.scheduled_at);
      const minutes = bookedDate.getHours() * 60 + bookedDate.getMinutes();
      // Block the slot and any overlapping slots
      for (let m = minutes; m < minutes + durationMin; m += slotDuration) {
        bookedMinutes.add(m);
      }
    }

    // 5. Mark each slot as available / unavailable
    const now = new Date();
    const isToday = dateStr === now.toISOString().split('T')[0];

    const slots: TimeSlot[] = allSlots.map((slotMinutes) => {
      const isPast = isToday && slotMinutes <= now.getHours() * 60 + now.getMinutes();
      const isBooked = bookedMinutes.has(slotMinutes);

      return {
        time: this.minutesToTime(slotMinutes),
        displayTime: this.minutesToDisplayTime(slotMinutes),
        available: !isPast && !isBooked,
      };
    });

    return {
      date: dateStr,
      displayDate: this.formatDisplayDate(date),
      slots,
    };
  }

  /**
   * Get available slots for the next N days.
   */
  async getMultiDayAvailability(
    vendorId: string,
    serviceId: string,
    startDate: string,
    days = 14
  ): Promise<DayAvailability[]> {
    const results: DayAvailability[] = [];
    const start = new Date(startDate + 'T00:00:00');

    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const day = await this.getAvailableSlots(vendorId, serviceId, dateStr);
      results.push(day);
    }

    return results;
  }

  // ─── Private helpers ───────────────────────────────────────

  private generateSlots(
    openTime: string,
    closeTime: string,
    slotDuration: number,
    serviceDuration: number
  ): number[] {
    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);
    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;
    const slots: number[] = [];

    // Last slot must end before closing
    for (let t = openMin; t + serviceDuration <= closeMin; t += slotDuration) {
      slots.push(t);
    }
    return slots;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  private minutesToDisplayTime(minutes: number): string {
    const h24 = Math.floor(minutes / 60);
    const m = minutes % 60;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
  }

  private formatDisplayDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
