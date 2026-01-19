import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import logger from '../utils/logger';
import config from '../config';

// Custom token for response time in milliseconds
morgan.token('response-time-ms', (_req: Request, res: Response) => {
  const responseTime = res.getHeader('X-Response-Time');
  return responseTime ? `${responseTime}ms` : '-';
});

// Custom token for user ID (if authenticated)
morgan.token('user-id', (req: Request) => {
  return (req as any).user?.id || 'anonymous';
});

// Custom format for morgan logs
const morganFormat = config.env === 'production'
  ? ':remote-addr - :user-id [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms'
  : ':method :url :status :response-time ms - :res[content-length]';

// Morgan middleware with Winston integration
export const morganMiddleware = morgan(morganFormat, {
  stream: {
    write: (message: string) => {
      // Remove trailing newline
      logger.http(message.trim());
    },
  },
  skip: (req: Request) => {
    // Skip logging health check requests to reduce noise
    return req.path === '/health';
  },
});

// Request logging middleware (logs request details)
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  // Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: (req as any).user?.id || 'anonymous',
    };

    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error('Request failed', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Client error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
};

// Add response time header middleware
