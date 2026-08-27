import Joi from 'joi';

const operatingDaySchema = Joi.object({
  open: Joi.string().pattern(/^\d{2}:\d{2}$/).default('08:00'),
  close: Joi.string().pattern(/^\d{2}:\d{2}$/).default('19:00'),
  closed: Joi.boolean().default(false),
});

const operatingHoursSchema = Joi.object({
  monday: operatingDaySchema,
  tuesday: operatingDaySchema,
  wednesday: operatingDaySchema,
  thursday: operatingDaySchema,
  friday: operatingDaySchema,
  saturday: operatingDaySchema,
  sunday: operatingDaySchema,
});

export const createVendorSchema = Joi.object({
  businessName: Joi.string().min(2).max(150).required(),
  description: Joi.string().max(1000).optional(),
  phone: Joi.string().min(10).max(20).required(),
  email: Joi.string().email().optional(),
  address: Joi.string().min(5).max(300).required(),
  city: Joi.string().min(2).max(100).required(),
  state: Joi.string().min(2).max(100).required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  operatingHours: operatingHoursSchema.optional(),
});

export const updateVendorSchema = Joi.object({
  businessName: Joi.string().min(2).max(150).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  phone: Joi.string().min(10).max(20).optional(),
  email: Joi.string().email().optional().allow(''),
  address: Joi.string().min(5).max(300).optional(),
  city: Joi.string().min(2).max(100).optional(),
  state: Joi.string().min(2).max(100).optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  operatingHours: operatingHoursSchema.optional(),
}).min(1);
