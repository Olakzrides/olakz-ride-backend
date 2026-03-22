import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../config/database';
import logger from './logger';

const BUCKET = 'food-photos';

export class FoodStorageUtil {
  static async ensureBucket(): Promise<void> {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 5 * 1024 * 1024 });
    }
  }

  static async uploadPhoto(
    file: Express.Multer.File,
    folder: string
  ): Promise<{ path: string; signedUrl: string }> {
    const ext = file.originalname.split('.').pop() || 'jpg';
    const filePath = `${folder}/${uuidv4()}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 7 * 24 * 60 * 60); // 7 days

    if (signErr) throw new Error(`Signed URL failed: ${signErr.message}`);

    return { path: filePath, signedUrl: signed.signedUrl };
  }

  static async getSignedUrl(filePath: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, expiresIn);
    if (error) throw new Error(`Signed URL failed: ${error.message}`);
    return data.signedUrl;
  }
}
