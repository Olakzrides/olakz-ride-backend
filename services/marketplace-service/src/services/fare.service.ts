import { prisma } from '../config/database';
import { haversineKm } from '../utils/maps';

export class FareService {
  static async calculateFare(params: {
    storeLat: number;
    storeLng: number;
    deliveryLat: number;
    deliveryLng: number;
  }) {
    const config = await prisma.marketplaceFareConfig.findFirst({
      where: { vehicleType: 'motorcycle', isActive: true },
    });

    const pricePerKm = config ? parseFloat(config.pricePerKm.toString()) : 150;
    const minFee = config ? parseFloat(config.minimumDeliveryFee.toString()) : 300;
    const serviceFee = config ? parseFloat(config.serviceFee.toString()) : 50;

    const distanceKm = haversineKm(params.storeLat, params.storeLng, params.deliveryLat, params.deliveryLng);
    const rawDeliveryFee = distanceKm * pricePerKm;
    const deliveryFee = Math.max(rawDeliveryFee, minFee);

    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      distanceText: `${(Math.round(distanceKm * 10) / 10).toFixed(1)} km`,
      deliveryFee: Math.round(deliveryFee),
      serviceFee: Math.round(serviceFee),
      currencyCode: config?.currencyCode || 'NGN',
    };
  }
}
