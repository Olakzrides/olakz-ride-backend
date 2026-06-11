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

    const pricePerKm = config ? parseFloat(config.estimatedBillingUnit.toString()) : 150;
    const minFee     = config ? parseFloat(config.minAmountLessThan3km.toString())  : 300;
    const serviceFee = config ? parseFloat(config.serviceFee.toString())             : 50;

    const distanceKm     = haversineKm(params.storeLat, params.storeLng, params.deliveryLat, params.deliveryLng);
    const rawDeliveryFee = distanceKm * pricePerKm;
    const deliveryFee    = Math.max(rawDeliveryFee, minFee);
    const estimatedBillingUnit = config ? parseFloat(config.estimatedBillingUnit.toString()) : 150;
    const minFee = config ? parseFloat(config.minAmountLessThan3km.toString()) : 300;
    const serviceFee = config ? parseFloat(config.serviceFee.toString()) : 50;

    const distanceKm = haversineKm(params.storeLat, params.storeLng, params.deliveryLat, params.deliveryLng);
    const rawDeliveryFee = distanceKm * estimatedBillingUnit;
    const deliveryFee = Math.max(rawDeliveryFee, minFee);

    return {
      distanceKm:   Math.round(distanceKm * 100) / 100,
      distanceText: `${(Math.round(distanceKm * 10) / 10).toFixed(1)} km`,
      deliveryFee:  Math.round(deliveryFee),
      serviceFee:   Math.round(serviceFee),
      currencyCode: 'NGN',
    };
  }
}
