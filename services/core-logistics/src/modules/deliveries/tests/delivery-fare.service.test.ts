/**
 * Unit Tests for DeliveryFareService
 * Tests fare calculation logic with the city-tiered pricing schema.
 *
 * FareBreakdown shape:
 *   distanceKm, distanceText, deliveryFee, serviceFee (= service + rounding),
 *   totalAmount, cityTier, currencyCode
 */

import { DeliveryFareService } from '../services/delivery-fare.service';

// ── Mock DB ───────────────────────────────────────────────────────────────────
jest.mock('../../../config/database', () => ({
  supabase: {
    from: jest.fn(() => ({
      select:      jest.fn().mockReturnThis(),
      eq:          jest.fn().mockReturnThis(),
      ilike:       jest.fn().mockReturnThis(),
      order:       jest.fn().mockReturnThis(),
      limit:       jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(() =>
        Promise.resolve({
          data: {
            // regions table mock (for resolveCityTier)
            name:                                'Lagos',
            // city_tier_states mock
            city_tier:                           'low',
            // delivery_fare_config mock
            vehicle_type_id:                     'vt-motorcycle',
            region_id:                           'region-lagos',
            estimated_billing_unit:              '100',
            high_traffic_estimated_billing_unit: '130',
            min_amount_less_than_3km:            '300',
            service_fee:                         '150',
            rounding_fee:                        '50',
            booking_fee:                         '0',
            fleet_commission_percent:            '10',
            currency_code:                       'NGN',
            is_active:                           true,
          },
          error: null,
        })
      ),
    })),
  },
}));

// ── Mock Maps ─────────────────────────────────────────────────────────────────
jest.mock('../../../utils/maps.util', () => ({
  MapsUtil: {
    getDirections: jest.fn((origin, destination) => {
      const latDiff = Math.abs(destination.latitude - origin.latitude);
      const lonDiff = Math.abs(destination.longitude - origin.longitude);
      const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111;
      return Promise.resolve({
        distance:     parseFloat(distance.toFixed(2)),
        duration:     Math.ceil(distance * 2),
        distanceText: `${distance.toFixed(1)} km`,
        durationText: `${Math.ceil(distance * 2)} mins`,
      });
    }),
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ─────────────────────────────────────────────────────────────────────────────

describe('DeliveryFareService', () => {
  const baseParams = {
    vehicleTypeId:    'vt-motorcycle',
    regionId:         'region-lagos',
    deliveryType:     'instant' as const,
    pickupLatitude:    6.5244,
    pickupLongitude:   3.3792,
    dropoffLatitude:   6.4281,
    dropoffLongitude:  3.4219,
  };

  describe('calculateFare — normal distance (≥ 3 km)', () => {
    it('returns a defined fare breakdown', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);
      expect(result).toBeDefined();
      expect(result.currencyCode).toBe('NGN');
    });

    it('delivery fee = distance × estimated_billing_unit', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);
      const expected = result.distanceKm * 100;
      expect(result.deliveryFee).toBeCloseTo(Math.round(expected), 0);
    });

    it('service fee = service_fee + rounding_fee combined (150 + 50 = 200)', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);
      expect(result.serviceFee).toBe(200);
    });

    it('total = deliveryFee + serviceFee', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);
      expect(result.totalAmount).toBe(result.deliveryFee + result.serviceFee);
    });

    it('includes distance info', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);
      expect(result.distanceKm).toBeGreaterThan(0);
      expect(typeof result.distanceText).toBe('string');
    });
  });

  describe('calculateFare — short distance (< 3 km)', () => {
    it('uses min_amount_less_than_3km (300) when distance is under 3 km', async () => {
      const shortParams = {
        ...baseParams,
        dropoffLatitude:  6.5250, // ~0.07 km from pickup
        dropoffLongitude: 3.3793,
      };
      const result = await DeliveryFareService.calculateFare(shortParams);
      expect(result.deliveryFee).toBeGreaterThanOrEqual(300);
    });
  });

  describe('FareBreakdown shape', () => {
    it('has all required fields', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);
      expect(result).toHaveProperty('distanceKm');
      expect(result).toHaveProperty('distanceText');
      expect(result).toHaveProperty('deliveryFee');
      expect(result).toHaveProperty('serviceFee');
      expect(result).toHaveProperty('totalAmount');
      expect(result).toHaveProperty('cityTier');
      expect(result).toHaveProperty('currencyCode');
    });

    it('all numeric fields are numbers', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);
      expect(typeof result.distanceKm).toBe('number');
      expect(typeof result.deliveryFee).toBe('number');
      expect(typeof result.serviceFee).toBe('number');
      expect(typeof result.totalAmount).toBe('number');
    });

    it('all fare values are non-negative', async () => {
      const result = await DeliveryFareService.calculateFare(baseParams);
      expect(result.distanceKm).toBeGreaterThanOrEqual(0);
      expect(result.deliveryFee).toBeGreaterThanOrEqual(0);
      expect(result.serviceFee).toBeGreaterThanOrEqual(0);
      expect(result.totalAmount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('estimateFare', () => {
    it('returns fare estimate with positional signature', async () => {
      const result = await DeliveryFareService.estimateFare(
        'vt-motorcycle',
        'region-lagos',
        6.5244, 3.3792,
        6.4281, 3.4219,
        'instant'
      );
      expect(result).toBeDefined();
      expect(result.totalAmount).toBeGreaterThan(0);
    });

    it('defaults deliveryType to instant', async () => {
      const result = await DeliveryFareService.estimateFare(
        'vt-motorcycle',
        'region-lagos',
        6.5244, 3.3792,
        6.4281, 3.4219
      );
      expect(result.serviceFee).toBe(200); // 150 + 50
    });
  });
});
