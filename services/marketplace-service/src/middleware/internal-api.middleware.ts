import { Request, Response, NextFunction } from 'express';
import { ResponseUtil } from '../utils/response';

export function internalApiAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-internal-api-key'];
  if (key !== process.env.INTERNAL_API_KEY) {
    ResponseUtil.unauthorized(res, 'Invalid internal API key');
    return;
  }
  next();
}
