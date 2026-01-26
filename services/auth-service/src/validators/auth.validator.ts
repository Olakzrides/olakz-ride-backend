import Joi from 'joi';

// Password regex: 8+ chars, uppercase, lowercase, number, special char
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#^()_\-+=[\]{}|:;,./<>~@$!%*?&])[A-Za-z\d#^()_\-+=[\]{}|:;,./<>~@$!%*?&]{8,}$/;

const passwordValidation = Joi.string()
  .min(8)
  .pattern(passwordRegex)
  .required()
  .messages({
    'string.pattern.base': 'Password must contain at least 8 characters, including uppercase, lowercase, number, and special characters (e.g. #^()_-+=[]|:;,./<>~@$!%*?&)',
    'string.min': 'Password must be at least 8 characters long',
    'any.required': 'Password is required',
  });

const emailValidation = Joi.string()
  .email()
  .lowercase()
  .trim()
  .required()
  .messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  });

const otpValidation = Joi.string()
  .length(4)
  .pattern(/^\d{4}$/)
  .required()
  .messages({
    'string.length': 'OTP must be 4 digits',
    'string.pattern.base': 'OTP must contain only numbers',
    'any.required': 'OTP is required',
  });

export const registerValidator = {
  body: Joi.object({
    firstName: Joi.string()
      .min(2)
      .max(50)
      .trim()
      .required()
      .messages({
        'string.min': 'First name must be at least 2 characters',
        'string.max': 'First name cannot exceed 50 characters',
        'any.required': 'First name is required',
      }),
    lastName: Joi.string()
      .min(2)
      .max(50)
      .trim()
      .required()
      .messages({
        'string.min': 'Last name must be at least 2 characters',
        'string.max': 'Last name cannot exceed 50 characters',
        'any.required': 'Last name is required',
      }),
    email: emailValidation,
    password: passwordValidation,
  }),
};

export const verifyEmailValidator = {
  body: Joi.object({
    email: emailValidation,
    otp: otpValidation,
  }),
};

export const resendOTPValidator = {
  body: Joi.object({
    email: emailValidation,
  }),
};

export const loginValidator = {
  body: Joi.object({
    email: emailValidation,
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
    }),
  }),
};

export const refreshTokenValidator = {
  body: Joi.object({
    refreshToken: Joi.string().required().messages({
      'any.required': 'Refresh token is required',
    }),
  }),
};

export const forgotPasswordValidator = {
  body: Joi.object({
    email: emailValidation,
  }),
};

export const resetPasswordValidator = {
  body: Joi.object({
    email: emailValidation,
    otp: otpValidation,
    newPassword: passwordValidation,
  }),
};

export const googleTokenValidator = {
  body: Joi.object({
    googleToken: Joi.string().required().messages({
      'any.required': 'Google token is required',
    }),
  }),
};

export const appleSignInValidator = {
  body: Joi.object({
    authorization_code: Joi.string().required().messages({
      'any.required': 'Apple authorization code is required',
    }),
    user_info: Joi.object({
      name: Joi.object({
        firstName: Joi.string().optional(),
        lastName: Joi.string().optional(),
      }).optional(),
      email: Joi.string().email().optional(),
    }).optional(),
  }),
};