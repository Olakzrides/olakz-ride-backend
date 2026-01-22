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
      // Fetch service channels
      const serviceChannels = await this.prisma.service_channels.findMany({
        where: { active: true },
        orderBy: [
          { rank: 'asc' }
        ]
      });

      // Transform service channels to match expected format (without products for now)
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
        product: [] // Empty for now until products table is properly linked
      }));

      // Fetch advertisements
      const advertisements = await this.prisma.advertisements.findMany({
        where: { active: true },
        orderBy: [
          { rank: 'asc' }
        ]
      });

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
        userId: userId || 'anonymous'
      });

      return storeData;

    } catch (error) {
      logger.error('Error fetching store init data:', error);
      
      // Return fallback data
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
      // TODO: Implement tracking once user_service_usages table is properly set up
      logger.info('Service selection tracked (placeholder)', {
        userId,
        serviceName: selectionData.service_channel_name
      });

    } catch (error) {
      logger.error('Error tracking service selection:', error);
      // Don't throw error - tracking is not critical
    }
  }

  /**
   * Get user's service context
   */
  async getUserServiceContext(userId: string): Promise<any> {
    try {
      // TODO: Implement once user_service_usages table is properly set up
      return { recentServices: [], totalServices: 0 };

    } catch (error) {
      logger.error('Error fetching user service context:', error);
      return { recentServices: [], totalServices: 0 };
    }
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