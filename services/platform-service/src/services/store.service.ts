import { PrismaClient } from '@prisma/client';
import Database from '../utils/database';
import CacheUtil from '../utils/cache';
import logger from '../utils/logger';

// Define types based on Prisma schema
type ServiceChannel = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
};

type Product = {
  id: string;
  serviceChannelId: string;
  handle: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  thumbnail: string | null;
  isActive: boolean;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
};

type Advertisement = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  targetUrl: string | null;
  isActive: boolean;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
};

// Type for service channel with products
type ServiceChannelWithProducts = ServiceChannel & {
  products: Product[];
};

interface StoreInitData {
  supported_sales_channels: any[];
  ads: any[];
  main_services: any[];
  vendors: {
    trending: { data: any[] };
    new: { data: any[] };
    featured: { data: any[] };
    nearby: { data: any[] };
  };
}

interface ServiceSelectionData {
  service_channel_name: string;
  user_location?: {
    latitude: number;
    longitude: number;
  };
  metadata?: Record<string, any>;
  [key: string]: any; // Index signature for Prisma JSON compatibility
}

class StoreService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = Database.getInstance();
  }

  /**
   * Get store initialization data for homepage
   */
  async getStoreInitData(userId?: string): Promise<StoreInitData> {
    const cacheKey = `store_init_${userId || 'anonymous'}`;
    
    // Try to get from cache first
    const cached = CacheUtil.get<StoreInitData>(cacheKey);
    if (cached) {
      logger.debug('Store init data served from cache');
      return cached;
    }

    try {
      // Test database connection first
      await this.prisma.$queryRaw`SELECT 1`;
      logger.info('Database connection successful');

      // Fetch service channels with their products using Prisma include
      const serviceChannels = await (this.prisma.service_channels as any).findMany({
        where: { active: true },
        include: {
          products: {
            where: { isActive: true }
          }
        },
        orderBy: [
          { rank: 'asc' }
        ]
      });

      logger.info('Service channels fetched', { count: serviceChannels.length });

      // Transform service channels to match expected format with products
      const supportedSalesChannels: any[] = serviceChannels.map((channel: any) => ({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        is_active: channel.active,
        metadata: { 
          rank: channel.rank,
          icon: channel.name,
          color: this.getServiceColor(channel.name)
        },
        product: channel.products.map((product: any) => ({
          id: product.id,
          handle: product.handle,
          title: product.title,
          subtitle: product.subtitle,
          description: product.description,
          thumbnail: product.thumbnail,
          is_active: product.isActive,
          metadata: product.metadata
        }))
      }));

      // Fetch advertisements
      const advertisements = await this.prisma.advertisements.findMany({
        where: { active: true },
        orderBy: [
          { rank: 'asc' }
        ]
      });

      logger.info('Advertisements fetched', { count: advertisements.length });

      // Transform advertisements
      const ads = advertisements.map((ad: any) => ({
        id: ad.id,
        name: ad.title,
        description: ad.description,
        metadata: {
          adsRank: ad.rank,
          imageUrl: ad.image_url,
          targetUrl: ad.link_url
        }
      }));

      // Filter main services (exclude ride and delivery for now)
      const mainServices = supportedSalesChannels.filter(
        (channel: any) => !['mobile_ride_sc', 'mobile_delivery_sc'].includes(channel.name)
      );

      const storeData: StoreInitData = {
        supported_sales_channels: supportedSalesChannels,
        ads,
        main_services: mainServices,
        vendors: {
          trending: { data: [] },
          new: { data: [] },
          featured: { data: [] },
          nearby: { data: [] }
        }
      };

      // Cache the result
      CacheUtil.set(cacheKey, storeData);
      
      logger.info('Store init data fetched successfully', {
        serviceChannels: supportedSalesChannels.length,
        advertisements: ads.length,
        totalProducts: supportedSalesChannels.reduce((sum, channel) => sum + channel.product.length, 0),
        userId: userId || 'anonymous'
      });

      return storeData;

    } catch (error: any) {
      logger.error('Error fetching store init data:', {
        error: error.message,
        stack: error.stack,
        userId: userId || 'anonymous'
      });
      
      // Return fallback data
      logger.warn('Falling back to hardcoded data due to database error');
      return this.getFallbackStoreData();
    }
  }

  /**
   * Get service color based on service name
   */
  private getServiceColor(serviceName: string): string {
    const colorMap: Record<string, string> = {
      'mobile_ride_sc': '#E3F2FD',
      'mobile_delivery_sc': '#FFF3E0', 
      'mobile_food_sc': '#FFE5E5',
      'mobile_marketplace_sc': '#F3E5F5',
      'mobile_bills_sc': '#E8F5E8',
      'mobile_transport_hire_sc': '#FFF8E1',
      'mobile_auto_wash_sc': '#E1F5FE',
      'mobile_car_dealers_sc': '#F1F8E9',
      'mobile_auto_mechanic_sc': '#FFF3E0',
      'mobile_spare_parts_sc': '#FCE4EC'
    };
    return colorMap[serviceName] || '#F5F5F5';
  }

  /**
   * Track service selection by user
   */
  async trackServiceSelection(
    userId: string,
    selectionData: ServiceSelectionData
  ): Promise<void> {
    try {
      // Insert into user_service_usages table
      await (this.prisma as any).user_service_usages.create({
        data: {
          userId: userId,
          serviceChannelId: await this.getServiceChannelIdByName(selectionData.service_channel_name),
          sessionData: {
            user_location: selectionData.user_location,
            metadata: selectionData.metadata,
            timestamp: new Date().toISOString()
          },
          startedAt: new Date(),
          lastActivityAt: new Date(),
          isActive: true
        }
      });

      // Also track in analytics table
      await (this.prisma as any).service_analytics.create({
        data: {
          serviceChannelId: await this.getServiceChannelIdByName(selectionData.service_channel_name),
          userId: userId,
          eventType: 'service_selected',
          eventData: {
            service_name: selectionData.service_channel_name,
            user_location: selectionData.user_location,
            metadata: selectionData.metadata
          },
          timestamp: new Date(),
          userAgent: selectionData.metadata?.userAgent,
          ipAddress: selectionData.metadata?.ip
        }
      });

      logger.info('Service selection tracked successfully', {
        userId,
        serviceName: selectionData.service_channel_name
      });

    } catch (error: any) {
      logger.error('Error tracking service selection:', {
        error: error.message,
        userId,
        serviceName: selectionData.service_channel_name
      });
      // Don't throw error - tracking is not critical
    }
  }

  /**
   * Get user's service context
   */
  async getUserServiceContext(userId: string): Promise<any> {
    try {
      // Get recent service usages
      const recentUsages = await (this.prisma as any).user_service_usages.findMany({
        where: { 
          userId: userId,
          isActive: true 
        },
        include: {
          service_channels: true
        },
        orderBy: { lastActivityAt: 'desc' },
        take: 10
      });

      // Transform to expected format
      const recentServices = recentUsages.map((usage: any) => ({
        id: usage.id,
        service_name: usage.service_channels.name,
        service_description: usage.service_channels.description,
        last_used: usage.lastActivityAt,
        session_data: usage.sessionData
      }));

      return { 
        recentServices,
        totalServices: recentUsages.length 
      };

    } catch (error: any) {
      logger.error('Error fetching user service context:', {
        error: error.message,
        userId
      });
      return { recentServices: [], totalServices: 0 };
    }
  }

  /**
   * Helper method to get service channel ID by name
   */
  private async getServiceChannelIdByName(serviceName: string): Promise<string> {
    const channel = await this.prisma.service_channels.findFirst({
      where: { name: serviceName }
    });
    
    if (!channel) {
      throw new Error(`Service channel not found: ${serviceName}`);
    }
    
    return channel.id;
  }

  /**
   * Get fallback data when database fails
   */
  private getFallbackStoreData(): StoreInitData {
    logger.warn('Using fallback store data');
    
    return {
      supported_sales_channels: [
        {
          id: 'fallback-ride',
          name: 'mobile_ride_sc',
          description: 'Olakz Ride',
          is_active: true,
          metadata: { rank: 1, icon: 'mobile_ride_sc', color: '#E3F2FD' },
          product: []
        },
        {
          id: 'fallback-delivery',
          name: 'mobile_delivery_sc',
          description: 'Delivery Service',
          is_active: true,
          metadata: { rank: 2, icon: 'mobile_delivery_sc', color: '#FFF3E0' },
          product: []
        },
        {
          id: 'fallback-food',
          name: 'mobile_food_sc',
          description: 'Olakz Foods',
          is_active: true,
          metadata: { rank: 3, icon: 'mobile_food_sc', color: '#FFE5E5' },
          product: []
        }
      ],
      ads: [],
      main_services: [
        {
          id: 'fallback-food',
          name: 'mobile_food_sc',
          description: 'Olakz Foods',
          is_active: true,
          metadata: { rank: 3, icon: 'mobile_food_sc', color: '#FFE5E5' },
          product: []
        }
      ],
      vendors: {
        trending: { data: [] },
        new: { data: [] },
        featured: { data: [] },
        nearby: { data: [] }
      }
    };
  }
}

export default StoreService;