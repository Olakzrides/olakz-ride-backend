import Joi from 'joi';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#^()_\-+=[\]{}|:;,./<>~@$!%*?&])[A-Za-z\d#^()_\-+=[\]{}|:;,./<>~@$!%*?&]{8,}$/;

export const updateProfileValidator = {
  body: Joi.object({
    firstName: Joi.string().min(2).max(50).trim().optional(),
    lastName: Joi.string().min(2).max(50).trim().optional(),
    username: Joi.string().min(3).max(30).alphanum().trim().optional(),
    phone: Joi.string().min(10).max(20).pattern(/^\+?[0-9]+$/).optional().messages({
      'string.pattern.base': 'Phone number must contain only numbers and optional + prefix',
    }),
    avatarUrl: Joi.string().uri().optional(),
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update',
  }),
};

export const updateRoleValidator = {
  body: Joi.object({
    roles: Joi.array()
      .items(Joi.string().valid('customer', 'driver', 'admin'))
      .min(1)
      .required()
      .messages({
        'array.min': 'At least one role is required',
        'any.required': 'Roles are required',
      }),
    activeRole: Joi.string()
      .valid('customer', 'driver', 'admin')
      .optional()
      .messages({
        'any.only': 'Active role must be one of: customer, driver, admin',
      }),
  }),
};

export const changePasswordValidator = {
  body: Joi.object({
    currentPassword: Joi.string().required().messages({
      'any.required': 'Current password is required',
    }),
    newPassword: Joi.string()
      .min(8)
      .pattern(passwordRegex)
      .required()
      .messages({
        'string.pattern.base': 'New password must contain at least 8 characters, including uppercase, lowercase, number, and special character',
        'string.min': 'New password must be at least 8 characters long',
        'any.required': 'New password is required',
      }),
  }),
};