import { prisma } from '../config/database';
import { haversineKm } from '../utils/maps';

export class FareService {
  static async calculateFare(params: {
    storeLat: number;
    storeLng: number;
    deliveryLat: number;
    deliveryLng: number;
    /** City tier of the delivery location — defaults to 'low' */
    cityTier?: 'high' | 'middle' | 'low';
    /** Vehicle type to use — defaults to 'motorcycle' */
    vehicleType?: string;
  }) {
    const vehicleType = params.vehicleType ?? 'motorcycle';
    const cityTier    = params.cityTier    ?? 'low';

    // Try exact vehicle_type + city_tier match.
    // Fall back to low tier, then any active row for that vehicle type.
    const config = await prisma.marketplaceFareConfig.findFirst({
      where: { vehicleType, cityTier, isActive: true },
    }) ?? await prisma.marketplaceFareConfig.findFirst({
      where: { vehicleType, cityTier: 'low', isActive: true },
    }) ?? await prisma.marketplaceFareConfig.findFirst({
      where: { vehicleType, isActive: true },
    });

  
    // Strictly use admin-configured values — no hardcoded fallbacks. 
    const estimatedBillingUnit = config ? parseFloat(config.estimatedBillingUnit.toString()) : 0; 
    const minAmountLessThan3km = config ? parseFloat(config.minAmountLessThan3km.toString()) : 0; 
    const serviceFeeRaw = config ? parseFloat(config.serviceFee.toString()) : 0; 
    const roundingFeeRaw = config ? parseFloat(config.roundingFee.toString()) : 0; 
    const distanceKm = haversineKm(params.storeLat, params.storeLng, params.deliveryLat, params.deliveryLng);

    const rawDeliveryFee = distanceKm * estimatedBillingUnit;

    // > 3km: delivery_fee = distance × estimated_billing_unit
    // ≤ 3km: delivery_fee = min_amount_less_than_3km (flat fee)
    const deliveryFee =
      distanceKm < 3
        ? minAmountLessThan3km
        : rawDeliveryFee;

      // Combine service fee + rounding fee into one line item for the customer
      const serviceFee = serviceFeeRaw + roundingFeeRaw;
      const totalFees = deliveryFee + serviceFee;

    return {
      distanceKm:   Math.round(distanceKm * 100) / 100,
      distanceText: `${(Math.round(distanceKm * 10) / 10).toFixed(1)} km`,
      deliveryFee:  Math.round(deliveryFee),
      serviceFee:   Math.round(serviceFee),
      totalFees:    Math.round(totalFees),
      currencyCode: 'NGN',
    };
  }
}
