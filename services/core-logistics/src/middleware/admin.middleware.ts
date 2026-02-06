import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';

interface AdminUser {
  id: string;
  email: string;
  roles: string[];
  isAdmin: boolean;
}

interface AdminRequest extends Request {
  user?: AdminUser;
}

// Simple response utilities for admin endpoints
const sendError = (res: Response, statusCode: number, message: string, code?: string) => {
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      timestamp: new Date().toISOString(),
    },
  });
};

/**
 * Middleware to verify admin authentication and authorization
 */
export const adminAuthMiddleware = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 401, 'Admin authentication required', 'ADMIN_AUTH_REQUIRED');
      return;
    }

    const token = authHeader.substring(7);

    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET not configured');
      sendError(res, 500, 'Authentication configuration error', 'AUTH_CONFIG_ERROR');
      return;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;

    if (!decoded || (!decoded.id && !decoded.userId)) {
      sendError(res, 401, 'Invalid admin token', 'INVALID_ADMIN_TOKEN');
      return;
    }

    // Get user ID (support both id and userId for compatibility)
    const userId = decoded.id || decoded.userId;

    // Check if user has admin role
    // Handle both single role (role) and multiple roles (roles) formats
    const userRoles = decoded.roles || (decoded.role ? [decoded.role] : []);
    const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');

    if (!isAdmin) {
      sendError(res, 403, 'Admin access required', 'ADMIN_ACCESS_REQUIRED');
      return;
    }

    // Add user info to request
    req.user = {
      id: userId,
      email: decoded.email,
      roles: userRoles,
      isAdmin: true,
    };

    logger.info('Admin authenticated:', {
      adminId: userId,
      email: decoded.email,
      roles: userRoles,
      endpoint: req.path,
    });

    next();
  } catch (error: any) {
    logger.error('Admin auth middleware error:', error);

    if (error.name === 'JsonWebTokenError') {
      sendError(res, 401, 'Invalid admin token', 'INVALID_ADMIN_TOKEN');
    } else if (error.name === 'TokenExpiredError') {
      sendError(res, 401, 'Admin token expired', 'ADMIN_TOKEN_EXPIRED');
    } else {
      sendError(res, 500, 'Admin authentication error', 'ADMIN_AUTH_ERROR');
    }
  }
};

/**
 * Middleware to check for super admin role (for sensitive operations)
 */
export const superAdminMiddleware = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, 'Authentication required', 'AUTH_REQUIRED');
      return;
    }

    const isSuperAdmin = req.user.roles.includes('super_admin');

    if (!isSuperAdmin) {
      sendError(res, 403, 'Super admin access required', 'SUPER_ADMIN_REQUIRED');
      return;
    }

    logger.info('Super admin authenticated:', {
      adminId: req.user.id,
      email: req.user.email,
      endpoint: req.path,
    });

    next();
  } catch (error: any) {
    logger.error('Super admin middleware error:', error);
    sendError(res, 500, 'Super admin authentication error', 'SUPER_ADMIN_AUTH_ERROR');
  }
};

/**
 * Middleware to log admin actions for audit trail
 */
export const adminAuditMiddleware = (action: string) => {
  return (req: AdminRequest, _res: Response, next: NextFunction): void => {
    // Log the admin action
    logger.info('Admin action initiated:', {
      action,
      adminId: req.user?.id,
      email: req.user?.email,
      endpoint: req.path,
      method: req.method,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    // Continue to next middleware
    next();
  };
};

/**
 * Rate limiting for admin endpoints (stricter than regular endpoints)
 */
export const adminRateLimitMiddleware = (
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: AdminRequest, _res: Response, next: NextFunction): void => {
    const key = `admin_${req.user?.id || req.ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [k, v] of requests.entries()) {
      if (v.resetTime < windowStart) {
        requests.delete(k);
      }
    }

    // Get or create request tracking
    let requestData = requests.get(key);
    if (!requestData || requestData.resetTime < windowStart) {
      requestData = { count: 0, resetTime: now + windowMs };
      requests.set(key, requestData);
    }

    // Check rate limit
    if (requestData.count >= maxRequests) {
      logger.warn('Admin rate limit exceeded:', {
        adminId: req.user?.id,
        ip: req.ip,
        count: requestData.count,
        limit: maxRequests,
      });

      sendError(_res, 429, 'Admin rate limit exceeded', 'ADMIN_RATE_LIMIT_EXCEEDED');
      return;
    }

    // Increment counter
    requestData.count++;

    next();
  };
};