import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { validateRequest } from '../middleware/auth.middleware';
import {
  registerValidator,
  verifyEmailValidator,
  resendOTPValidator,
  loginValidator,
  refreshTokenValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  googleTokenValidator,
  appleSignInValidator,
} from '../validators/auth.validator';

const router = Router();

// Registration & Email Verification
router.post('/register', validateRequest(registerValidator), authController.register);
router.post('/verify-email', validateRequest(verifyEmailValidator), authController.verifyEmail);
router.post('/resend-otp', validateRequest(resendOTPValidator), authController.resendOTP);

// Login & Token Management
router.post('/login', validateRequest(loginValidator), authController.login);
router.post('/refresh', validateRequest(refreshTokenValidator), authController.refresh);
router.post('/logout', validateRequest(refreshTokenValidator), authController.logout);

// Password Reset
router.post('/forgot-password', validateRequest(forgotPasswordValidator), authController.forgotPassword);
router.post('/reset-password', validateRequest(resetPasswordValidator), authController.resetPassword);

// Google OAuth
router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleCallback);
router.post('/google/verify', validateRequest(googleTokenValidator), authController.googleVerify);

// Apple Sign-In
router.post('/apple/signin', validateRequest(appleSignInValidator), authController.appleSignIn);
router.get('/apple/callback', authController.appleCallback);

export default router;