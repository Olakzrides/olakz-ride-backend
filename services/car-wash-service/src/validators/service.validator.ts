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
  name:             Joi.string().min(2).max(100).required(),
  description:      Joi.string().max(500).optional().allow(''),
  category:         Joi.string().valid(...WASH_CATEGORIES).required(),
  durationMinutes:  Joi.number().integer().min(5).max(480).required(),
  price:            Joi.number().positive().required(),
  // Optional: assign directly to a vendor custom category at creation time
  customCategoryId: Joi.string().uuid().optional().allow(null),
});

export const updateWashServiceSchema = Joi.object({
  name:             Joi.string().min(2).max(100).optional(),
  description:      Joi.string().max(500).optional().allow(''),
  category:         Joi.string().valid(...WASH_CATEGORIES).optional(),
  durationMinutes:  Joi.number().integer().min(5).max(480).optional(),
  price:            Joi.number().positive().optional(),
  isActive:         Joi.boolean().optional(),
  // Assign or unassign from a custom category
  customCategoryId: Joi.string().uuid().optional().allow(null),
}).min(1);
