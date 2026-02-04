import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  } | {
    id: string;
    email: string;
    roles: string[];
    isAdmin: boolean;
  };
}

/**
 * Verify JWT token and attach user to request
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ResponseUtil.unauthorized(res, 'No token provided');
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as any;

      (req as AuthRequest).user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        role: decoded.role || 'customer',
      };

      next();
    } catch (error) {
      logger.error('Token verification error:', error);
      return ResponseUtil.unauthorized(res, 'Invalid or expired token');
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return ResponseUtil.serverError(res, 'Authentication failed');
  }
};

/**
 * Check if user has required role
 */
// export const authorize = (...roles: string[]) => {
//   return (req: Request, res: Response, next: NextFunction): void | Response => {
//     const user = (req as AuthRequest).user;

//     if (!user) {
//       return ResponseUtil.unauthorized(res);
//     }

//     if (!roles.includes(user.role)) {
//       return ResponseUtil.forbidden(res, 'Insufficient permissions');
//     }

//     next();
//   };
// };
