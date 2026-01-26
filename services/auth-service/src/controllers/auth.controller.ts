import { Request, Response, NextFunction } from 'express';
import authService from '../services/auth.service';
import tokenService from '../services/token.service';
import googleService from '../services/google.service';
import appleService from '../services/apple.service';
import ResponseUtil from '../utils/response';

class AuthController {
  /**
   * Register new user
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log("Before.auth REGISTER BODY:", req.body);
      const result = await authService.register(req.body);
      console.log("After.auth REGISTER BODY:", req.body);
      ResponseUtil.success(
        res,
        result,
        'Registration successful. Please check your email for verification code.',
        201
      );
    } catch (error) {
      console.error("REGISTER ERROR:", error);
      next(error);
    }
  }

  /**
   * Verify email with OTP
   */
  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.verifyEmail(req.body.email, req.body.otp);
      ResponseUtil.success(res, null, 'Email verified successfully. You can now login.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resend OTP
   */
  async resendOTP(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.resendOTP(req.body.email);
      ResponseUtil.success(res, null, 'Verification code sent successfully. Please check your email.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Login user
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ipAddress = (req.ip || req.socket.remoteAddress || '').replace('::ffff:', '');
      const result = await authService.login(req.body, ipAddress);
      ResponseUtil.success(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh access token
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tokens = await tokenService.refreshAccessToken(req.body.refreshToken);
      ResponseUtil.success(res, tokens, 'Token refreshed successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout user
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.logout(req.body.refreshToken);
      ResponseUtil.success(res, null, 'Logout successful');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Forgot password - send OTP
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.forgotPassword(req.body.email);
      ResponseUtil.success(
        res,
        null,
        'If an account exists with this email, a password reset code has been sent.'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset password with OTP
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.resetPassword(req.body.email, req.body.otp, req.body.newPassword);
      ResponseUtil.success(res, null, 'Password reset successful. Please login with your new password.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Google OAuth - Get auth URL
   */
  async googleAuth(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authUrl = googleService.getAuthUrl();
      res.redirect(authUrl);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Google OAuth - Handle callback
   */
  async googleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code } = req.query;
      if (!code || typeof code !== 'string') {
        throw new Error('Authorization code not provided');
      }

      const result = await googleService.handleCallback(code);

      // Redirect to frontend with tokens (in production, use proper redirect)
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`;
      res.redirect(redirectUrl);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Google OAuth - Verify token (for mobile apps)
   */
  async googleVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await googleService.verifyGoogleToken(req.body.googleToken);
      ResponseUtil.success(res, result, 'Google authentication successful');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Apple Sign-In - Handle authorization code (for mobile/web apps)
   */
  async appleSignIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await appleService.handleAppleSignIn(req.body);
      ResponseUtil.success(res, result, 'Apple authentication successful');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Apple Sign-In - Handle callback (for web-based flow)
   */
  async appleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, state } = req.query;
      if (!code || typeof code !== 'string') {
        throw new Error('Authorization code not provided');
      }

      const result = await appleService.handleCallback(code, state as string);

      // Redirect to frontend with tokens (in production, use proper redirect)
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`;
      res.redirect(redirectUrl);
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();