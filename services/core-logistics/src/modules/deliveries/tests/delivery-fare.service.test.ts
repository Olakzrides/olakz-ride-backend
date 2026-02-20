/**
 * Unit Tests for DeliveryFareService
 * Tests fare calculation logic with various scenarios
 */

import { DeliveryFareService } from '../services/delivery-fare.service';

// Mock the dependencies
jest.mock('../../../config/database', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(() => ({
                data: {
                  base_fare: '500',
                  price_per_km: '100',
                  minimum_fare: '300',
                  scheduled_delivery_surcharge: '200',
                  currency_code: 'NGN',
                },
                error: null,
              })),
            })),
          })),
        })),
      })),
    })),
  },
}));

jest.mock('../../../utils/maps.util', () => ({
  MapsUtil: {
    getDirections: jest.fn((origin, destination) => {
      // Calculate simple distance for testing
      const latDiff = Math.abs(destination.latitude - origin.latitude);
      const lonDiff = Math.abs(destination.longitude - origin.longitude);
      const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111; // Rough km conversion
      
      return Promise.resolve({
        distance: parseFloat(distance.toFixed(2)),
        duration: Math.ceil(distance * 2),
        distanceText: `${distance.toFixed(1)} km`,
        durationText: `${Math.ceil(distance * 2)} mins`,
      });
    }),
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('DeliveryFareService', () => {
  describe('calculateFare', () => {
    const baseParams = {
      vehicleTypeId: 'test-vehicle-id',
      regionId: 'test-region-id',
      pickupLatitude: 6.5244,
      pickupLongitude: 3.3792,
      dropoffLatitude: 6.4281,
      dropoffLongitude: 3.4219,
      deliveryType: 'instant' as const,
    };

    it('should calculate fare for instant delivery', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);

      expect(result).toBeDefined();
      expect(result.baseFare).toBe(500);
      expect(result.distanceFare).toBeGreaterThan(0);
      expect(result.totalFare).toBeGreaterThan(0);
      expect(result.finalFare).toBeGreaterThan(0);
      expect(result.currencyCode).toBe('NGN');
      expect(result.scheduledSurcharge).toBe(0);
    });

    it('should calculate fare for scheduled delivery', async () => {
      const scheduledParams = {
        ...baseParams,
        deliveryType: 'scheduled' as const,
      };

      const result = await DeliveryFareService.calculateFare(scheduledParams);

      expect(result.scheduledSurcharge).toBe(200);
      expect(result.totalFare).toBeGreaterThan(result.baseFare + result.distanceFare);
    });

    it('should apply minimum fare when total is below minimum', async () => {
      // Use very close locations to get low distance fare
      const shortDistanceParams = {
        ...baseParams,
        pickupLatitude: 6.5244,
        pickupLongitude: 3.3792,
        dropoffLatitude: 6.5245,
        dropoffLongitude: 3.3793,
      };

      const result = await DeliveryFareService.calculateFare(shortDistanceParams);

      expect(result.minimumFare).toBe(300);
      expect(result.finalFare).toBeGreaterThanOrEqual(result.minimumFare);
    });

    it('should include distance information', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);

      expect(result.distance).toBeGreaterThan(0);
      expect(result.distanceText).toBeDefined();
      expect(typeof result.distanceText).toBe('string');
    });

    it('should calculate distance fare correctly', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);

      // Distance fare should be distance * price_per_km
      const expectedDistanceFare = result.distance * 100;
      expect(result.distanceFare).toBeCloseTo(expectedDistanceFare, 2);
    });

    it('should calculate total fare correctly', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);

      const expectedTotal = result.baseFare + result.distanceFare + result.scheduledSurcharge;
      expect(result.totalFare).toBeCloseTo(expectedTotal, 2);
    });
  });

  describe('Fare calculation edge cases', () => {
    const baseParams = {
      vehicleTypeId: 'test-vehicle-id',
      regionId: 'test-region-id',
      pickupLatitude: 6.5244,
      pickupLongitude: 3.3792,
      dropoffLatitude: 6.5244,
      dropoffLongitude: 3.3792,
      deliveryType: 'instant' as const,
    };

    it('should handle same pickup and dropoff locations', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);

      expect(result.finalFare).toBeGreaterThanOrEqual(result.minimumFare);
    });

    it('should handle long distances', async () => {
      const longDistanceParams = {
        ...baseParams,
        dropoffLatitude: 7.5244,
        dropoffLongitude: 4.3792,
      };

      const result = await DeliveryFareService.calculateFare(longDistanceParams);

      expect(result.distance).toBeGreaterThan(10);
      expect(result.distanceFare).toBeGreaterThan(1000);
    });
  });

  describe('Fare breakdown structure', () => {
    it('should return all required fare breakdown fields', async () => {
      const params = {
        vehicleTypeId: 'test-vehicle-id',
        regionId: 'test-region-id',
        pickupLatitude: 6.5244,
        pickupLongitude: 3.3792,
        dropoffLatitude: 6.4281,
        dropoffLongitude: 3.4219,
        deliveryType: 'instant' as const,
      };

      const result = await DeliveryFareService.calculateFare(params);

      expect(result).toHaveProperty('baseFare');
      expect(result).toHaveProperty('distanceFare');
      expect(result).toHaveProperty('scheduledSurcharge');
      expect(result).toHaveProperty('totalFare');
      expect(result).toHaveProperty('minimumFare');
      expect(result).toHaveProperty('finalFare');
      expect(result).toHaveProperty('distance');
      expect(result).toHaveProperty('distanceText');
      expect(result).toHaveProperty('currencyCode');
    });

    it('should have numeric values for fare fields', async () => {
      const params = {
        vehicleTypeId: 'test-vehicle-id',
        regionId: 'test-region-id',
        pickupLatitude: 6.5244,
        pickupLongitude: 3.3792,
        dropoffLatitude: 6.4281,
        dropoffLongitude: 3.4219,
        deliveryType: 'instant' as const,
      };

      const result = await DeliveryFareService.calculateFare(params);

      expect(typeof result.baseFare).toBe('number');
      expect(typeof result.distanceFare).toBe('number');
      expect(typeof result.scheduledSurcharge).toBe('number');
      expect(typeof result.totalFare).toBe('number');
      expect(typeof result.minimumFare).toBe('number');
      expect(typeof result.finalFare).toBe('number');
      expect(typeof result.distance).toBe('number');
    });

    it('should have non-negative fare values', async () => {
      const params = {
        vehicleTypeId: 'test-vehicle-id',
        regionId: 'test-region-id',
        pickupLatitude: 6.5244,
        pickupLongitude: 3.3792,
        dropoffLatitude: 6.4281,
        dropoffLongitude: 3.4219,
        deliveryType: 'instant' as const,
      };

      const result = await DeliveryFareService.calculateFare(params);

      expect(result.baseFare).toBeGreaterThanOrEqual(0);
      expect(result.distanceFare).toBeGreaterThanOrEqual(0);
      expect(result.scheduledSurcharge).toBeGreaterThanOrEqual(0);
      expect(result.totalFare).toBeGreaterThanOrEqual(0);
      expect(result.minimumFare).toBeGreaterThanOrEqual(0);
      expect(result.finalFare).toBeGreaterThanOrEqual(0);
      expect(result.distance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('estimateFare', () => {
    it('should provide fare estimate without creating delivery', async () => {
      const result = await DeliveryFareService.estimateFare(
        'test-vehicle-id',
        'test-region-id',
        6.5244,
        3.3792,
        6.4281,
        3.4219,
        'instant'
      );

      expect(result).toBeDefined();
      expect(result.finalFare).toBeGreaterThan(0);
    });

    it('should default to instant delivery type', async () => {
      const result = await DeliveryFareService.estimateFare(
        'test-vehicle-id',
        'test-region-id',
        6.5244,
        3.3792,
        6.4281,
        3.4219
      );

      expect(result.scheduledSurcharge).toBe(0);
    });
  });
});
