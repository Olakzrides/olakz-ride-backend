import Joi from 'joi';

export const createBookingSchema = Joi.object({
  vendorId:          Joi.string().uuid().required(),
  serviceId:         Joi.string().uuid().required(),
  bookingType:       Joi.string().valid('book_now', 'scheduled').required(),
  scheduledAt: Joi.when('bookingType', {
    is:        'scheduled',
    then:      Joi.string().isoDate().required(),
    otherwise: Joi.string().isoDate().optional(),
  }),
  serviceAddress:   Joi.string().min(5).max(300).required(),
  serviceLatitude:  Joi.number().min(-90).max(90).required(),
  serviceLongitude: Joi.number().min(-180).max(180).required(),

  // ── Structured vehicle fields (from booking form) ────────────────
  vehicleMake:        Joi.string().max(100).optional().allow('', null),
  vehicleModel:       Joi.string().max(100).optional().allow('', null),
  vehicleYear:        Joi.number().integer().min(1900).max(2100).optional().allow(null),
  vehiclePlateNumber: Joi.string().max(30).optional().allow('', null),
  // free-text notes about the vehicle (kept for backward compat)
  vehicleDescription: Joi.string().max(500).optional().allow('', null),

  notes:         Joi.string().max(500).optional().allow('', null),
  paymentMethod: Joi.string().valid('wallet', 'card', 'cash').required(),
});

export const cancelBookingSchema = Joi.object({
  cancellationReason: Joi.string().max(500).required(),
});

export const rateBookingSchema = Joi.object({
  rating:   Joi.number().integer().min(1).max(5).required(),
  feedback: Joi.string().max(1000).optional().allow(''),
});

export const searchVendorsSchema = Joi.object({
  latitude:   Joi.number().min(-90).max(90).required(),
  longitude:  Joi.number().min(-180).max(180).required(),
  radiusKm:   Joi.number().min(0.5).max(100).default(10),
  category: Joi.string()
    .valid(
      'oil_change',
      'tyre_service',
      'brake_service',
      'engine_repair',
      'electrical_repair',
      'general_service'
    )
    .optional(),
  query:  Joi.string().max(100).optional().allow(''),
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(50).default(20),
  sortBy: Joi.string().valid('distance', 'rating', 'newest').default('distance'),
});
