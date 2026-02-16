import { PrismaClient } from '../../node_modules/.prisma/logistics-client';
import { logger } from '../config/logger';

const prisma = new PrismaClient();

export class LocationHistoryService {
  /**
   * Record a location visit (called when ride completes)
   * Updates visit count if location exists, creates new record otherwise
   */
  async recordLocationVisit(
    userId: string,
    locationType: 'pickup' | 'dropoff',
    location: {
      latitude: number;
      longitude: number;
      address: string;
    }
  ): Promise<void> {
    try {
      // Try to update existing record
      const existing = await prisma.recentLocation.findUnique({
        where: {
          userId_address: {
            userId,
            address: location.address,
          },
        },
      });

      if (existing) {
        // Update existing record
        await prisma.recentLocation.update({
          where: { id: existing.id },
          data: {
            visitCount: { increment: 1 },
            lastVisitedAt: new Date(),
            locationType, // Update to most recent type
            latitude: location.latitude,
            longitude: location.longitude,
          },
        });

        logger.info('Updated recent location visit', {
          userId,
          address: location.address,
          visitCount: existing.visitCount + 1,
        });
      } else {
        // Create new record
        await prisma.recentLocation.create({
          data: {
            userId,
            locationType,
            latitude: location.latitude,
            longitude: location.longitude,
            address: location.address,
            visitCount: 1,
            lastVisitedAt: new Date(),
          },
        });

        logger.info('Created new recent location', {
          userId,
          address: location.address,
        });
      }
    } catch (error) {
      logger.error('Error recording location visit:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Get user's recent locations (top 5 most recent)
   */
  async getRecentLocations(userId: string, limit: number = 5) {
    try {
      const locations = await prisma.recentLocation.findMany({
        where: { userId },
        orderBy: { lastVisitedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          address: true,
          latitude: true,
          longitude: true,
          locationType: true,
          visitCount: true,
          lastVisitedAt: true,
        },
      });

      return locations.map((loc) => ({
        id: loc.id,
        address: loc.address,
        latitude: parseFloat(loc.latitude.toString()),
        longitude: parseFloat(loc.longitude.toString()),
        locationType: loc.locationType,
        visitCount: loc.visitCount,
        lastVisitedAt: loc.lastVisitedAt,
      }));
    } catch (error) {
      logger.error('Error fetching recent locations:', error);
      throw new Error('Failed to fetch recent locations');
    }
  }

  /**
   * Get recent locations by type (pickup or dropoff)
   */
  async getRecentLocationsByType(
    userId: string,
    locationType: 'pickup' | 'dropoff',
    limit: number = 5
  ) {
    try {
      const locations = await prisma.recentLocation.findMany({
        where: {
          userId,
          locationType,
        },
        orderBy: { lastVisitedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          address: true,
          latitude: true,
          longitude: true,
          visitCount: true,
          lastVisitedAt: true,
        },
      });

      return locations.map((loc) => ({
        id: loc.id,
        address: loc.address,
        latitude: parseFloat(loc.latitude.toString()),
        longitude: parseFloat(loc.longitude.toString()),
        visitCount: loc.visitCount,
        lastVisitedAt: loc.lastVisitedAt,
      }));
    } catch (error) {
      logger.error('Error fetching recent locations by type:', error);
      throw new Error('Failed to fetch recent locations');
    }
  }

  /**
   * Clear old locations (keep only last 50 per user)
   * Can be run as a cleanup job
   */
  async cleanupOldLocations(userId: string): Promise<void> {
    try {
      const locations = await prisma.recentLocation.findMany({
        where: { userId },
        orderBy: { lastVisitedAt: 'desc' },
        select: { id: true },
      });

      // Keep only top 50
      if (locations.length > 50) {
        const idsToKeep = locations.slice(0, 50).map((l) => l.id);
        await prisma.recentLocation.deleteMany({
          where: {
            userId,
            id: { notIn: idsToKeep },
          },
        });

        logger.info('Cleaned up old locations', {
          userId,
          deleted: locations.length - 50,
        });
      }
    } catch (error) {
      logger.error('Error cleaning up old locations:', error);
    }
  }
}
