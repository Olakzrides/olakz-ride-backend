import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
    roles?: string[];
  };
}

interface JWTPayload {
  id: string;
  email: string;
  role: string;
  roles?: string[];
  iat?: number;
  exp?: number;
}

/**
 * Optional authentication middleware
 * Extracts user info from JWT token if available, but doesn't require authentication
 */
export const optionalAuthMiddleware = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user info
      return next();
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return next();
    }

    // Get JWT secret from environment
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    
    try {
      const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
      
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role || 'customer',
        roles: decoded.roles || ['customer']
      };

      logger.debug('User authenticated via JWT', {
        userId: decoded.id,
        email: decoded.email,
        role: decoded.role
      });

    } catch (jwtError: any) {
      logger.warn('Invalid JWT token', {
        error: jwtError.message,
        token: token.substring(0, 20) + '...'
      });
      // Continue without user info for optional auth
    }

    next();
  } catch (error: any) {
    logger.error('Auth middleware error:', error);
    // Don't fail the request for optional auth
    next();
  }
};

/**
 * Required authentication middleware
 * Requires valid JWT token
 */
export const requireAuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Authorization header required',
        error: { code: 'UNAUTHORIZED' },
        timestamp: new Date().toISOString()
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'JWT token required',
        error: { code: 'UNAUTHORIZED' },
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Get JWT secret from environment
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    
    try {
      const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
      
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role || 'customer',
        roles: decoded.roles || ['customer']
      };

      logger.debug('User authenticated via JWT', {
        userId: decoded.id,
        email: decoded.email,
        role: decoded.role
      });

      next();
    } catch (jwtError: any) {
      logger.warn('Invalid JWT token', {
        error: jwtError.message,
        token: token.substring(0, 20) + '...'
      });
      
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        error: { code: 'UNAUTHORIZED' },
        timestamp: new Date().toISOString()
      });
      return;
    }

  } catch (error: any) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: { code: 'INTERNAL_SERVER_ERROR' },
      timestamp: new Date().toISOString()
    });
    return;
  }
};