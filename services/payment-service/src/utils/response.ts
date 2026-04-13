import { Response } from 'express';

export class ResponseUtil {
  static success(res: Response, data: any, message = 'Success', statusCode = 200): Response {
    return res.status(statusCode).json({ success: true, message, data, timestamp: new Date().toISOString() });
  }

  static created(res: Response, data: any, message = 'Created'): Response {
    return res.status(201).json({ success: true, message, data, timestamp: new Date().toISOString() });
  }

  static badRequest(res: Response, message: string): Response {
    return res.status(400).json({ success: false, message, timestamp: new Date().toISOString() });
  }

  static unauthorized(res: Response, message = 'Unauthorized'): Response {
    return res.status(401).json({ success: false, message, timestamp: new Date().toISOString() });
  }

  static forbidden(res: Response, message = 'Forbidden'): Response {
    return res.status(403).json({ success: false, message, timestamp: new Date().toISOString() });
  }

  static notFound(res: Response, message = 'Not found'): Response {
    return res.status(404).json({ success: false, message, timestamp: new Date().toISOString() });
  }

  static serverError(res: Response, message = 'Internal server error'): Response {
    return res.status(500).json({ success: false, message, error: { code: 'INTERNAL_SERVER_ERROR' }, timestamp: new Date().toISOString() });
  }
}
