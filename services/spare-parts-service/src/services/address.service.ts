import { supabase } from '../config/database';

/**
 * Address service for spare parts.
 *
 * Reads and writes to marketplace_saved_addresses — the same table
 * used by marketplace-service. This means a customer's saved addresses
 * (Home, Office, etc.) are shared seamlessly between marketplace and
 * spare parts with no duplication.
 */
export class AddressService {
  static async list(userId: string) {
    const { data, error } = await supabase
      .from('marketplace_saved_addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  static async create(
    userId: string,
    data: {
      label:      string;
      address:    string;
      city?:      string;
      state?:     string;
      latitude?:  number;
      longitude?: number;
      is_default?: boolean;
    }
  ) {
    // If setting as default, unset any existing defaults first
    if (data.is_default) {
      await supabase
        .from('marketplace_saved_addresses')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    const { data: created, error } = await supabase
      .from('marketplace_saved_addresses')
      .insert({
        user_id:    userId,
        label:      data.label,
        address:    data.address,
        city:       data.city       || null,
        state:      data.state      || null,
        latitude:   data.latitude   || null,
        longitude:  data.longitude  || null,
        is_default: data.is_default || false,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return created;
  }

  static async update(
    userId:    string,
    addressId: string,
    data: {
      label?:      string;
      address?:    string;
      city?:       string;
      state?:      string;
      latitude?:   number;
      longitude?:  number;
      is_default?: boolean;
    }
  ) {
    // Verify ownership
    const { data: existing } = await supabase
      .from('marketplace_saved_addresses')
      .select('id')
      .eq('id', addressId)
      .eq('user_id', userId)
      .single();

    if (!existing) throw new Error('Address not found');

    if (data.is_default) {
      await supabase
        .from('marketplace_saved_addresses')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    const updatePayload: Record<string, any> = {};
    if (data.label      !== undefined) updatePayload.label      = data.label;
    if (data.address    !== undefined) updatePayload.address    = data.address;
    if (data.city       !== undefined) updatePayload.city       = data.city;
    if (data.state      !== undefined) updatePayload.state      = data.state;
    if (data.latitude   !== undefined) updatePayload.latitude   = data.latitude;
    if (data.longitude  !== undefined) updatePayload.longitude  = data.longitude;
    if (data.is_default !== undefined) updatePayload.is_default = data.is_default;

    const { data: updated, error } = await supabase
      .from('marketplace_saved_addresses')
      .update(updatePayload)
      .eq('id', addressId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return updated;
  }

  static async delete(userId: string, addressId: string) {
    const { data: existing } = await supabase
      .from('marketplace_saved_addresses')
      .select('id')
      .eq('id', addressId)
      .eq('user_id', userId)
      .single();

    if (!existing) throw new Error('Address not found');

    const { error } = await supabase
      .from('marketplace_saved_addresses')
      .delete()
      .eq('id', addressId);

    if (error) throw new Error(error.message);
  }
}
