import { Application } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import config from '../config';
import logger from '../utils/logger';
import ResponseUtil from '../utils/response';
import { authRateLimiter } from '../middleware/rate-limit.middleware';

// Proxy options factory
const createProxyOptions = (target: string, pathRewrite?: any): Options => ({
  target,
  changeOrigin: true,
  pathRewrite,
  logLevel: config.env === 'development' ? 'debug' : 'warn',
  
  // Handle errors
  onError: (err: any, req, res) => {
    logger.error('Proxy error:', {
      error: err.message,
      target,
      path: req.url,
      method: req.method,
    });

    const response = res as any;
    if (!response.headersSent) {
      if (err.code === 'ECONNREFUSED') {
        ResponseUtil.serviceUnavailable(
          response,
          target.includes('3003') ? 'Auth' :
          target.includes('3001') ? 'Logistics' : 
          target.includes('3002') ? 'Payment' :
          target.includes('3004') ? 'Platform' : 'Unknown',
          'Service is not reachable. Please try again later.'
        );
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        ResponseUtil.error(
          response,
          'Request timeout',
          504,
          'GATEWAY_TIMEOUT',
          'The backend service took too long to respond'
        );
      } else {
        ResponseUtil.error(
          response,
          'Gateway error',
          502,
          'BAD_GATEWAY',
          config.env === 'development' ? err.message : undefined
        );
      }
    }
  },

  // Add custom headers
  onProxyReq: (proxyReq, req: any) => {
    // If body has been parsed by express.json(), re-send it to the proxied service
    // This avoids issues where the body was consumed by the gateway and never forwarded
    if (req.body && Object.keys(req.body).length && ['POST','PUT','PATCH'].includes(req.method)) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }

    // Log proxied request
    logger.debug('Proxying request:', {
      method: req.method,
      path: req.url,
      target
    });
  },


  // Log response
  onProxyRes: (proxyRes, req) => {
    logger.debug('Proxy response:', {
      statusCode: proxyRes.statusCode,
      path: req.url,
      target,
    });
  },

  // Timeout settings
  proxyTimeout: config.services.auth.timeout,
  timeout: config.services.auth.timeout,
});

/**
 * Setup all proxy routes
 */
export function setupRoutes(app: Application): void {
  // Apple Sign-In routes (MUST come before general /api/auth route)
  app.use(
    '/api/auth/apple',
    createProxyMiddleware(createProxyOptions(config.services.auth.url))
  );

  // Auth Service routes (with stricter rate limiting)
  app.use(
    '/api/auth',
    authRateLimiter,
    createProxyMiddleware(createProxyOptions(config.services.auth.url))
  );

  // User Service routes (proxied to auth service)
  app.use(
    '/api/users',
    createProxyMiddleware(createProxyOptions(config.services.auth.url))
  );

  // Logistics Service routes - Phase 1 (Ride Booking)
  app.use(
    '/api/ride',
    createProxyMiddleware(createProxyOptions(config.services.logistics.url))
  );

  app.use(
    '/api/carts',
    createProxyMiddleware(createProxyOptions(config.services.logistics.url))
  );

  app.use(
    '/api/variants',
    createProxyMiddleware(createProxyOptions(config.services.logistics.url))
  );

  // Logistics Service routes - Phase 2 (Driver Management)
  app.use(
    '/api/drivers',
    createProxyMiddleware(createProxyOptions(config.services.logistics.url))
  );

  // Phase 2: Driver Registration routes (Multi-step registration flow)
  app.use(
    '/api/driver-registration',
    createProxyMiddleware(createProxyOptions(config.services.logistics.url))
  );

  // Legacy logistics routes (for future phases)
  app.use(
    '/api/deliveries',
    createProxyMiddleware(createProxyOptions(config.services.logistics.url))
  );

  app.use(
    '/api/riders',
    createProxyMiddleware(createProxyOptions(config.services.logistics.url))
  );

  app.use(
    '/api/tracking',
    createProxyMiddleware(createProxyOptions(config.services.logistics.url))
  );

  app.use(
    '/api/pricing',
    createProxyMiddleware(createProxyOptions(config.services.logistics.url))
  );

  // Payment Service routes
  app.use(
    '/api/payments',
    createProxyMiddleware(createProxyOptions(config.services.payment.url))
  );

  // Platform Service routes (no auth middleware - service handles its own auth)
  app.use(
    '/api/store',
    createProxyMiddleware(createProxyOptions(config.services.platform.url))
  );

  app.use(
    '/api/services',
    createProxyMiddleware(createProxyOptions(config.services.platform.url))
  );

  logger.info('All proxy routes configured successfully');
}