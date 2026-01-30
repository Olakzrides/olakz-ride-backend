import { Request, Response, NextFunction } from 'express';
import { ResponseUtil } from '../utils/response.util';
import { DriverRegistrationErrorCode } from '../types/error-codes.types';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export class RegistrationRateLimitMiddleware {
  private store: RateLimitStore = {};
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly skipSuccessfulRequests: boolean;

  constructor(options: {
    windowMs?: number;
    maxRequests?: number;
    skipSuccessfulRequests?: boolean;
  } = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    this.maxRequests = options.maxRequests || 10; // 10 requests per window
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Rate limiting middleware for registration endpoints
   */
  middleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const key = this.generateKey(req);
    const now = Date.now();
    const resetTime = now + this.windowMs;

    // Initialize or get existing record
    if (!this.store[key] || now > this.store[key].resetTime) {
      this.store[key] = {
        count: 0,
        resetTime
      };
    }

    const record = this.store[key];

    // Check if limit exceeded
    if (record.count >= this.maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      
      // Set retry-after header
      res.set('Retry-After', retryAfter.toString());
      res.set('X-RateLimit-Limit', this.maxRequests.toString());
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

      ResponseUtil.rateLimitExceeded(res, retryAfter);
      return;
    }

    // Increment counter
    record.count++;

    // Set rate limit headers
    res.set('X-RateLimit-Limit', this.maxRequests.toString());
    res.set('X-RateLimit-Remaining', (this.maxRequests - record.count).toString());
    res.set('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

    // If configured to skip successful requests, decrement on success
    if (this.skipSuccessfulRequests) {
      const originalSend = res.send;
      res.send = function(body: any) {
        if (res.statusCode < 400) {
          record.count = Math.max(0, record.count - 1);
        }
        return originalSend.call(this, body);
      };
    }

    next();
  };

  /**
   * Stricter rate limiting for registration initiation
   */
  strictInitiationLimit = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const key = `initiate:${this.generateKey(req)}`;
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour window
    const maxRequests = 3; // Only 3 registration initiations per hour
    const resetTime = now + windowMs;

    // Initialize or get existing record
    if (!this.store[key] || now > this.store[key].resetTime) {
      this.store[key] = {
        count: 0,
        resetTime
      };
    }

    const record = this.store[key];

    // Check if limit exceeded
    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      
      res.set('Retry-After', retryAfter.toString());
      res.set('X-RateLimit-Limit', maxRequests.toString());
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.RATE_LIMIT_EXCEEDED,
        'Too many registration attempts. Please try again later.',
        undefined,
        { retry_after_seconds: retryAfter, limit_type: 'registration_initiation' }
      );
      return;
    }

    // Increment counter
    record.count++;

    // Set rate limit headers
    res.set('X-RateLimit-Limit', maxRequests.toString());
    res.set('X-RateLimit-Remaining', (maxRequests - record.count).toString());
    res.set('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

    next();
  };

  /**
   * Rate limiting for document uploads
   */
  documentUploadLimit = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const key = `documents:${this.generateKey(req)}`;
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // 10 minutes window
    const maxRequests = 20; // 20 document upload attempts per 10 minutes
    const resetTime = now + windowMs;

    // Initialize or get existing record
    if (!this.store[key] || now > this.store[key].resetTime) {
      this.store[key] = {
        count: 0,
        resetTime
      };
    }

    const record = this.store[key];

    // Check if limit exceeded
    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      
      res.set('Retry-After', retryAfter.toString());
      res.set('X-RateLimit-Limit', maxRequests.toString());
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.RATE_LIMIT_EXCEEDED,
        'Too many document upload attempts. Please try again later.',
        undefined,
        { retry_after_seconds: retryAfter, limit_type: 'document_upload' }
      );
      return;
    }

    // Increment counter
    record.count++;

    // Set rate limit headers
    res.set('X-RateLimit-Limit', maxRequests.toString());
    res.set('X-RateLimit-Remaining', (maxRequests - record.count).toString());
    res.set('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

    next();
  };

  /**
   * Generate unique key for rate limiting
   */
  private generateKey(req: AuthRequest): string {
    // Prefer user ID if authenticated, fallback to IP
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }

    // Get IP address (handle proxy headers)
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.connection.remoteAddress;
    
    return `ip:${ip}`;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, record] of Object.entries(this.store)) {
      if (now > record.resetTime) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      delete this.store[key];
    });

    console.log(`Rate limit cleanup: removed ${keysToDelete.length} expired entries`);
  }

  /**
   * Get current rate limit status for a request
   */
  getStatus(req: AuthRequest): {
    key: string;
    count: number;
    limit: number;
    remaining: number;
    resetTime: Date;
    isLimited: boolean;
  } {
    const key = this.generateKey(req);
    const record = this.store[key];
    const now = Date.now();

    if (!record || now > record.resetTime) {
      return {
        key,
        count: 0,
        limit: this.maxRequests,
        remaining: this.maxRequests,
        resetTime: new Date(now + this.windowMs),
        isLimited: false
      };
    }

    return {
      key,
      count: record.count,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - record.count),
      resetTime: new Date(record.resetTime),
      isLimited: record.count >= this.maxRequests
    };
  }

  /**
   * Reset rate limit for a specific key (admin function)
   */
  reset(req: AuthRequest): void {
    const key = this.generateKey(req);
    delete this.store[key];
  }

  /**
   * Get all current rate limit entries (admin function)
   */
  getAllEntries(): { [key: string]: { count: number; resetTime: string; remaining: number } } {
    const now = Date.now();
    const result: { [key: string]: { count: number; resetTime: string; remaining: number } } = {};

    for (const [key, record] of Object.entries(this.store)) {
      if (now <= record.resetTime) {
        result[key] = {
          count: record.count,
          resetTime: new Date(record.resetTime).toISOString(),
          remaining: Math.max(0, this.maxRequests - record.count)
        };
      }
    }

    return result;
  }
}

// Create singleton instances for different rate limiting scenarios
export const registrationRateLimit = new RegistrationRateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 requests per 15 minutes
  skipSuccessfulRequests: true
});

export const strictRegistrationRateLimit = new RegistrationRateLimitMiddleware({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 requests per hour
  skipSuccessfulRequests: false
});

export const documentUploadRateLimit = new RegistrationRateLimitMiddleware({
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxRequests: 20, // 20 uploads per 10 minutes
  skipSuccessfulRequests: true
});