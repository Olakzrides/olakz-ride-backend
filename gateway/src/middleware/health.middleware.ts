import { Request, Response } from 'express';
import axios from 'axios';
import config from '../config';
import logger from '../utils/logger';

interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'down';
  responseTime?: string;
  error?: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    [key: string]: ServiceHealth;
  };
}

/**
 * Check health of a single service
 */
async function checkServiceHealth(
  serviceName: string,
  serviceConfig: { url: string; healthCheck: string; timeout: number }
): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    const response = await axios.get(
      `${serviceConfig.url}${serviceConfig.healthCheck}`,
      {
        timeout: serviceConfig.timeout,
        validateStatus: (status) => status < 500,
      }
    );

    const responseTime = Date.now() - startTime;

    if (response.status === 200) {
      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
      };
    } else {
      return {
        status: 'unhealthy',
        responseTime: `${responseTime}ms`,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error: any) {
    logger.error(`Health check failed for ${serviceName}:`, error.message);
    return {
      status: 'down',
      error: error.code === 'ECONNREFUSED' ? 'Service not reachable' : error.message,
    };
  }
}

/**
 * Check all services health
 */
async function checkAllServicesHealth(): Promise<HealthStatus> {
  const serviceNames = ['auth', 'logistics', 'payment', 'platform'] as const;
  const serviceResults: { [key: string]: ServiceHealth } = {};

  // Check all services in parallel
  await Promise.all(
    serviceNames.map(async (serviceName) => {
      const serviceConfig = config.services[serviceName];
      serviceResults[serviceName] = await checkServiceHealth(serviceName, serviceConfig);
    })
  );

  // Determine overall gateway status
  const allHealthy = Object.values(serviceResults).every((s) => s.status === 'healthy');
  const anyDown = Object.values(serviceResults).some((s) => s.status === 'down');

  let overallStatus: 'healthy' | 'degraded' | 'down';
  if (allHealthy) {
    overallStatus = 'healthy';
  } else if (anyDown) {
    overallStatus = 'down';
  } else {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    service: 'api-gateway',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: serviceResults,
  };
}

/**
 * Health check endpoint handler
 */
export const healthCheckHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const health = await checkAllServicesHealth();
    
    // Return 200 if gateway is healthy, 503 if degraded or down
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error: any) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'down',
      service: 'api-gateway',
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
};