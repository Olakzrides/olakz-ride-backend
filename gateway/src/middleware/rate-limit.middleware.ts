import rateLimit from 'express-rate-limit';
import config from '../config';
import ResponseUtil from '../utils/response';
import logger from '../utils/logger';

// General rate limiter for all routes
export const generalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  
  // Custom handler for rate limit exceeded
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    ResponseUtil.rateLimitExceeded(res);
  },
  
  // Skip rate limiting in development for certain IPs (optional)
  skip: (req) => {
    if (config.env === 'development' && req.ip === '127.0.0.1') {
      return false; // Don't skip, apply rate limiting even in dev
    }
    return false;
  },
});

// Strict rate limiter for authentication routes (more restrictive)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs for auth routes
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    ResponseUtil.rateLimitExceeded(res);
  },
  
  // Only apply to specific auth routes
  skipSuccessfulRequests: false, // Count successful requests
  skipFailedRequests: false, // Count failed requests
});

// Very strict rate limiter for sensitive operations (e.g., password reset)
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 requests per hour
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req, res) => {
    logger.warn(`Strict rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    ResponseUtil.error(
      res,
      'Too many requests. Please try again in an hour.',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  },
});