import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import ResponseUtil from '../utils/response';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

interface JWTPayload {
  id: string;
  userId?: string; // Some tokens might use userId instead of id
  email: string;
  role: string;
  roles?: string[];
  iat?: number;
  exp?: number;
}

/**
 * Verify JWT token and check live account status.
 * Deleted/suspended accounts are rejected even if their JWT has not expired.
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ResponseUtil.unauthorized(res, 'No token provided');
    }

    const token = authHeader.substring(7);
    if (!token) return ResponseUtil.unauthorized(res, 'No token provided');

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return ResponseUtil.serverError(res, 'Authentication configuration error');
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
      const userId = decoded.userId || decoded.id;

      // Live status check — deleted/suspended users cannot use old tokens
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: userRow } = await supabase
        .from('users')
        .select('status')
        .eq('id', userId)
        .single();

      if (!userRow) return ResponseUtil.unauthorized(res, 'Account not found');
      if (userRow.status === 'account_deleted') {
        return ResponseUtil.unauthorized(res, 'This account has been deleted. Please register again.');
      }
      if (userRow.status !== 'active') {
        return ResponseUtil.unauthorized(res, 'Your account has been suspended. Please contact support.');
      }

      req.user = { id: userId, email: decoded.email, role: decoded.role || 'customer' };
      next();
    } catch (jwtError: any) {
      logger.warn('Invalid JWT token', { error: jwtError.message });
      return ResponseUtil.unauthorized(res, 'Invalid or expired token');
    }
  } catch (error: any) {
    logger.error('Authentication error:', error);
    return ResponseUtil.serverError(res, 'Authentication failed');
  }
};

/**
 * Optional authentication middleware
 * Extracts user info from JWT token if available, but doesn't require authentication
 */
export const optionalAuthenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user info
      return next();
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next();
    }

    // Get JWT secret from environment
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.warn('JWT_SECRET not configured for optional auth');
      return next();
    }
    
    try {
      const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
      
      req.user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        role: decoded.role || 'customer',
      };

      logger.debug('User optionally authenticated via JWT', {
        userId: req.user.id,
        email: req.user.email,
        role: req.user.role
      });

    } catch (jwtError: any) {
      logger.debug('Optional auth - invalid token, continuing without user', {
        error: jwtError.message
      });
      // Continue without user info for optional auth
    }

    next();
  } catch (error: any) {
    logger.error('Optional auth middleware error:', error);
    // Don't fail the request for optional auth
    next();
  }
};

/**
 * Check if user has required role
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void | Response => {
    const user = req.user;

    if (!user) {
      return ResponseUtil.unauthorized(res, 'Authentication required');
    }

    if (!roles.includes(user.role)) {
      return ResponseUtil.forbidden(res, 'Insufficient permissions');
    }

    next();
  };
};