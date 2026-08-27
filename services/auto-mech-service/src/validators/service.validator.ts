import Joi from 'joi';

const MECH_CATEGORIES = [
  'oil_change',
  'tyre_service',
  'brake_service',
  'engine_repair',
  'electrical_repair',
  'general_service',
] as const;

export const createMechServiceSchema = Joi.object({
  name:            Joi.string().min(2).max(100).required(),
  description:     Joi.string().max(500).optional().allow(''),
  durationMinutes: Joi.number().integer().min(5).max(480).required(),
  price:           Joi.number().positive().required(),

  // Range pricing — priceMax > priceMin shows "₦X - ₦Y" on the UI
  // priceMin defaults to price when omitted; priceMax omitted = fixed price
  priceMin: Joi.number().positive().optional(),
  priceMax: Joi.number().positive().optional()
    .when('priceMin', {
      is:   Joi.number().exist(),
      then: Joi.number().min(Joi.ref('priceMin')).optional()
        .messages({ 'number.min': 'priceMax must be greater than or equal to priceMin' }),
    })
    .when('price', {
      is:   Joi.number().exist(),
      then: Joi.number().min(Joi.ref('price')).optional()
        .messages({ 'number.min': 'priceMax must be greater than or equal to price' }),
    }),

  // System category — required UNLESS customCategoryId is provided
  category: Joi.string().valid(...MECH_CATEGORIES).when('customCategoryId', {
    is:        Joi.string().uuid().required(),
    then:      Joi.optional(),
    otherwise: Joi.required(),
  }),

  // Optional vendor custom category — if set, system category becomes optional
  customCategoryId: Joi.string().uuid().optional().allow(null),
}).messages({
  'any.required': '"category" is required when no customCategoryId is provided',
});

export const updateMechServiceSchema = Joi.object({
  name:             Joi.string().min(2).max(100).optional(),
  description:      Joi.string().max(500).optional().allow(''),
  category:         Joi.string().valid(...MECH_CATEGORIES).optional(),
  durationMinutes:  Joi.number().integer().min(5).max(480).optional(),
  price:            Joi.number().positive().optional(),
  priceMin:         Joi.number().positive().optional(),
  priceMax:         Joi.number().positive().optional().allow(null), // null = revert to fixed price
  isActive:         Joi.boolean().optional(),
  customCategoryId: Joi.string().uuid().optional().allow(null),
}).min(1);
