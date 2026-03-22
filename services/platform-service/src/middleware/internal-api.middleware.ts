import { Request, Response, NextFunction } from 'express';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';

export const internalApiMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const key = req.headers['x-internal-api-key'];
  if (key !== INTERNAL_API_KEY) {
    res.status(401).json({ success: false, error: { message: 'Unauthorized internal request' } });
    return;
  }
  next();
};
