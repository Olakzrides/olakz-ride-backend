import { prisma } from '../config/database';
import { haversineKm } from '../utils/maps';

export interface FareBreakdown {
  distanceKm:   number;
  distanceText: string;
  /** Distance-based charge (or min_amount_less_than_3km when ≤ 3 km) */
  deliveryFee:  number;
  /**
   * service_fee + rounding_fee combined.
   * This is what the customer sees as "Service Fee".
   */
  serviceFee:   number;
  /**
   * Raw rounding_fee from config — stored on the order row for audit/accounting
   * but NOT shown separately to the customer.
   */
  roundingFee:  number;
  /** deliveryFee + serviceFee (serviceFee already includes roundingFee) */
  totalFees:    number;
  currencyCode: string;
}

export class FareService {
  static async calculateFare(params: {
    storeLat:    number;
    storeLng:    number;
    deliveryLat: number;
    deliveryLng: number;
    cityTier?:   'high' | 'middle' | 'low';
    vehicleType?: string;
  }): Promise<FareBreakdown> {
    const vehicleType = params.vehicleType ?? 'motorcycle';
    const cityTier    = params.cityTier    ?? 'low';

    const config =
      (await prisma.marketplaceFareConfig.findFirst({
        where: { vehicleType, cityTier, isActive: true },
      })) ??
      (await prisma.marketplaceFareConfig.findFirst({
        where: { vehicleType, cityTier: 'low', isActive: true },
      })) ??
      (await prisma.marketplaceFareConfig.findFirst({
        where: { vehicleType, isActive: true },
      }));

    // Strictly use admin-configured values — no hardcoded fallbacks
    const estimatedBillingUnit = config ? parseFloat(config.estimatedBillingUnit.toString()) : 0;
    const minAmountLessThan3km = config ? parseFloat(config.minAmountLessThan3km.toString())  : 0;
    const serviceFeeRaw        = config ? parseFloat(config.serviceFee.toString())             : 0;
    const roundingFeeRaw       = config ? parseFloat(config.roundingFee.toString())            : 0;

    const distanceKm     = haversineKm(params.storeLat, params.storeLng, params.deliveryLat, params.deliveryLng);
    const rawDeliveryFee = distanceKm * estimatedBillingUnit;

    // ≤ 3 km → flat minimum fee   |   > 3 km → distance × rate
    const deliveryFee = distanceKm < 3 ? minAmountLessThan3km : rawDeliveryFee;

    // Combine service + rounding — customer sees one "Service Fee" line
    const serviceFee = serviceFeeRaw + roundingFeeRaw;
    const totalFees  = deliveryFee + serviceFee;

    return {
      distanceKm:   Math.round(distanceKm * 100) / 100,
      distanceText: `${(Math.round(distanceKm * 10) / 10).toFixed(1)} km`,
      deliveryFee:  Math.round(deliveryFee),
      serviceFee:   Math.round(serviceFee),       // combined — shown to customer
      roundingFee:  Math.round(roundingFeeRaw),   // raw — stored on order for audit
      totalFees:    Math.round(totalFees),
      currencyCode: 'NGN',
    };
  }
}
