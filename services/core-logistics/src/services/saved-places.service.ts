import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { Location } from '../types';

export interface SavedPlaceData {
  placeType: 'home' | 'work' | 'favorite';
  label?: string;
  location: Location;
  isDefault?: boolean;
}

export class SavedPlacesService {
  /**
   * Get user's saved places
   */
  async getUserSavedPlaces(userId: string, placeType?: string): Promise<any[]> {
    try {
      let query = supabase
        .from('saved_places')
        .select('*')
        .eq('user_id', userId);

      if (placeType) {
        query = query.eq('place_type', placeType);
      }

      const { data: places, error } = await query.order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching saved places:', error);
        return [];
      }

      return places || [];
    } catch (error) {
      logger.error('Error in getUserSavedPlaces:', error);
      return [];
    }
  }

  /**
   * Create a saved place
   */
  async createSavedPlace(userId: string, placeData: SavedPlaceData): Promise<{ success: boolean; place?: any; error?: string }> {
    try {
      // If setting as default, unset other defaults of same type
      if (placeData.isDefault) {
        await this.unsetDefaultPlace(userId, placeData.placeType);
      }

      const { data: place, error } = await supabase
        .from('saved_places')
        .insert({
          user_id: userId,
          place_type: placeData.placeType,
          label: placeData.label,
          latitude: placeData.location.latitude,
          longitude: placeData.location.longitude,
          address: placeData.location.address,
          is_default: placeData.isDefault || false,
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating saved place:', error);
        return { success: false, error: 'Failed to create saved place' };
      }

      logger.info(`Saved place created for user ${userId}:`, {
        placeId: place.id,
        placeType: placeData.placeType,
      });

      return { success: true, place };
    } catch (error) {
      logger.error('Error in createSavedPlace:', error);
      return { success: false, error: 'Failed to create saved place' };
    }
  }

  /**
   * Update a saved place
   */
  async updateSavedPlace(
    placeId: string,
    userId: string,
    updates: Partial<SavedPlaceData>
  ): Promise<{ success: boolean; place?: any; error?: string }> {
    try {
      // Verify ownership
      const { data: existingPlace, error: fetchError } = await supabase
        .from('saved_places')
        .select('*')
        .eq('id', placeId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !existingPlace) {
        return { success: false, error: 'Saved place not found' };
      }

      // If setting as default, unset other defaults of same type
      if (updates.isDefault && updates.placeType) {
        await this.unsetDefaultPlace(userId, updates.placeType);
      } else if (updates.isDefault) {
        await this.unsetDefaultPlace(userId, existingPlace.place_type);
      }

      const updateData: any = { updated_at: new Date().toISOString() };

      if (updates.placeType) updateData.place_type = updates.placeType;
      if (updates.label !== undefined) updateData.label = updates.label;
      if (updates.location) {
        updateData.latitude = updates.location.latitude;
        updateData.longitude = updates.location.longitude;
        updateData.address = updates.location.address;
      }
      if (updates.isDefault !== undefined) updateData.is_default = updates.isDefault;

      const { data: place, error } = await supabase
        .from('saved_places')
        .update(updateData)
        .eq('id', placeId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating saved place:', error);
        return { success: false, error: 'Failed to update saved place' };
      }

      logger.info(`Saved place ${placeId} updated`);
      return { success: true, place };
    } catch (error) {
      logger.error('Error in updateSavedPlace:', error);
      return { success: false, error: 'Failed to update saved place' };
    }
  }

  /**
   * Delete a saved place
   */
  async deleteSavedPlace(placeId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('saved_places')
        .delete()
        .eq('id', placeId)
        .eq('user_id', userId);

      if (error) {
        logger.error('Error deleting saved place:', error);
        return { success: false, error: 'Failed to delete saved place' };
      }

      logger.info(`Saved place ${placeId} deleted`);
      return { success: true };
    } catch (error) {
      logger.error('Error in deleteSavedPlace:', error);
      return { success: false, error: 'Failed to delete saved place' };
    }
  }

  /**
   * Set a place as default for its type
   */
  async setDefaultPlace(placeId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get place type
      const { data: place, error: fetchError } = await supabase
        .from('saved_places')
        .select('place_type')
        .eq('id', placeId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !place) {
        return { success: false, error: 'Saved place not found' };
      }

      // Unset other defaults of same type
      await this.unsetDefaultPlace(userId, place.place_type);

      // Set this as default
      const { error } = await supabase
        .from('saved_places')
        .update({
          is_default: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', placeId)
        .eq('user_id', userId);

      if (error) {
        logger.error('Error setting default place:', error);
        return { success: false, error: 'Failed to set default place' };
      }

      logger.info(`Place ${placeId} set as default`);
      return { success: true };
    } catch (error) {
      logger.error('Error in setDefaultPlace:', error);
      return { success: false, error: 'Failed to set default place' };
    }
  }

  /**
   * Unset default place for a type
   */
  private async unsetDefaultPlace(userId: string, placeType: string): Promise<void> {
    try {
      await supabase
        .from('saved_places')
        .update({
          is_default: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('place_type', placeType)
        .eq('is_default', true);
    } catch (error) {
      logger.error('Error unsetting default place:', error);
    }
  }

  /**
   * Get default place for a type
   */
  async getDefaultPlace(userId: string, placeType: string): Promise<any | null> {
    try {
      const { data: place, error } = await supabase
        .from('saved_places')
        .select('*')
        .eq('user_id', userId)
        .eq('place_type', placeType)
        .eq('is_default', true)
        .single();

      if (error) {
        return null;
      }

      return place;
    } catch (error) {
      logger.error('Error in getDefaultPlace:', error);
      return null;
    }
  }
}
