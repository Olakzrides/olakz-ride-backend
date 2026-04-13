import { Request, Response, NextFunction } from 'express';
import { ResponseUtil } from '../utils/response';
import config from '../config';

export const internalApiAuth = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-internal-api-key'] as string;

  if (!apiKey || apiKey !== config.internalApiKey) {
    ResponseUtil.unauthorized(res, 'Invalid or missing internal API key');
    return;
  }

  next();
};
