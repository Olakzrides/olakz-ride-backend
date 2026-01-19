import { Request, Response, NextFunction } from 'express';
import tokenService from '../services/token.service';
import { UnauthorizedError } from '../utils/errors';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

/**
 * Verify JWT token from Authorization header
 */
export const authMiddleware = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = tokenService.verifyAccessToken(token);

    // Attach user to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Validate request body/query/params with Joi
 */
export const validateRequest = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { body, query } = schema;

    if (body) {
      const { error } = body.validate(req.body, { abortEarly: false });
      if (error) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          error: {
            code: 'VALIDATION_ERROR',
            details: error.details,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    if (query) {
      const { error } = query.validate(req.query, { abortEarly: false });
      if (error) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          error: {
            code: 'VALIDATION_ERROR',
            details: error.details,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    next();
  };
};