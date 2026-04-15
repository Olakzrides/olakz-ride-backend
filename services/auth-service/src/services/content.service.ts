import supabase from '../utils/supabase';
import logger from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';

const VALID_KEYS = ['about_app', 'privacy_policy', 'terms_conditions'];

class ContentService {
  async getContent(key: string): Promise<any> {
    if (!VALID_KEYS.includes(key)) {
      throw new ValidationError(`key must be one of: ${VALID_KEYS.join(', ')}`);
    }

    const { data, error } = await supabase
      .from('app_content')
      .select('content_key, title, content, updated_at')
      .eq('content_key', key)
      .single();

    if (error || !data) {
      logger.error('Get content error:', error);
      throw new NotFoundError('Content not found');
    }

    return {
      key: data.content_key,
      title: data.title,
      content: data.content,
      updatedAt: data.updated_at,
    };
  }
}

export default new ContentService();
