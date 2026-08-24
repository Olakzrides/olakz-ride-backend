import Joi from 'joi';

const WASH_CATEGORIES = [
  'exterior_wash',
  'interior_wash',
  'engine_wash',
  'full_car_wash',
  'car_vacuuming',
  'wax_and_polish',
] as const;

export const createWashServiceSchema = Joi.object({
  name:            Joi.string().min(2).max(100).required(),
  description:     Joi.string().max(500).optional().allow(''),
  durationMinutes: Joi.number().integer().min(5).max(480).required(),
  price:           Joi.number().positive().required(),

  // System category — required UNLESS customCategoryId is provided
  category: Joi.string().valid(...WASH_CATEGORIES).when('customCategoryId', {
    is:        Joi.string().uuid().required(),
    then:      Joi.optional(),   // vendor picks custom category → system category optional
    otherwise: Joi.required(),  // no custom category → must pick a system one
  }),

  // Optional vendor custom category — if set, system category becomes optional
  customCategoryId: Joi.string().uuid().optional().allow(null),
}).messages({
  'any.required': '"category" is required when no customCategoryId is provided',
});

export const updateWashServiceSchema = Joi.object({
  name:             Joi.string().min(2).max(100).optional(),
  description:      Joi.string().max(500).optional().allow(''),
  category:         Joi.string().valid(...WASH_CATEGORIES).optional(),
  durationMinutes:  Joi.number().integer().min(5).max(480).optional(),
  price:            Joi.number().positive().optional(),
  isActive:         Joi.boolean().optional(),
  customCategoryId: Joi.string().uuid().optional().allow(null),
}).min(1);
