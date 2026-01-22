import { Request, Response } from 'express';
import StoreService from '../services/store.service';
import ResponseUtil from '../utils/response';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

class StoreController {
  private storeService: StoreService;

  constructor() {
    this.storeService = new StoreService();
  }

  /**
   * GET /store/init
   * Get store initialization data for homepage
   */
  getStoreInit = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      
      logger.info('Store init requested', { 
        userId: userId || 'anonymous',
        userAgent: req.get('User-Agent'),
        ip: req.ip 
      });

      const storeData = await this.storeService.getStoreInitData(userId);

      ResponseUtil.success(
        res,
        'Store data retrieved successfully',
        storeData
      );

    } catch (error: any) {
      logger.error('Store init error:', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id || 'anonymous'
      });

      ResponseUtil.serverError(
        res,
        'Failed to load store data',
        process.env.NODE_ENV === 'development' ? error.message : undefined
      );
    }
  };

  /**
   * POST /services/select
   * Track service selection by user
   */
  selectService = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        ResponseUtil.unauthorized(res, 'Authentication required to track service usage');
        return;
      }

      const { service_channel_name, user_location, metadata } = req.body;

      if (!service_channel_name) {
        ResponseUtil.validationError(
          res,
          { service_channel_name: 'Service channel name is required' },
          'Invalid service selection data'
        );
        return;
      }

      await this.storeService.trackServiceSelection(userId, {
        service_channel_name,
        user_location,
        metadata: {
          ...metadata,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          timestamp: new Date().toISOString()
        }
      });

      logger.info('Service selection tracked', {
        userId,
        serviceName: service_channel_name,
        location: user_location
      });

      ResponseUtil.success(
        res,
        'Service selection tracked successfully',
        { service: service_channel_name }
      );

    } catch (error: any) {
      logger.error('Service selection tracking error:', {
        error: error.message,
        userId: req.user?.id,
        body: req.body
      });

      ResponseUtil.serverError(
        res,
        'Failed to track service selection',
        process.env.NODE_ENV === 'development' ? error.message : undefined
      );
    }
  };

  /**
   * GET /services/context
   * Get user's service context and usage history
   */
  getServiceContext = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        ResponseUtil.unauthorized(res, 'Authentication required to get service context');
        return;
      }

      const context = await this.storeService.getUserServiceContext(userId);

      ResponseUtil.success(
        res,
        'Service context retrieved successfully',
        context
      );

    } catch (error: any) {
      logger.error('Service context error:', {
        error: error.message,
        userId: req.user?.id
      });

      ResponseUtil.serverError(
        res,
        'Failed to get service context',
        process.env.NODE_ENV === 'development' ? error.message : undefined
      );
    }
  };
}

export default StoreController;