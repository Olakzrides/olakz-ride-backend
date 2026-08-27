import { supabase } from '../config/database';
import { config } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

const BUCKET_NAME = config.supabase.storageBucket;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export class StorageUtil {
  static async initializeBucket(): Promise<void> {
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const exists = buckets?.some((b) => b.name === BUCKET_NAME);

      if (!exists) {
        const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: MAX_FILE_SIZE,
        });
        if (error) console.error('Error creating auto-mech bucket:', error);
        else console.log(`Bucket "${BUCKET_NAME}" created`);
      }
    } catch (err) {
      console.error('Error initialising auto-mech storage bucket:', err);
    }
  }

  /**
   * Upload a file and return its public URL and storage path.
   */
  static async uploadFile(
    file: Express.Multer.File,
    folder: string
  ): Promise<{ url: string; path: string }> {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new Error(`File type ${file.mimetype} is not allowed`);
    }

    const ext = file.originalname.split('.').pop();
    const filePath = `${folder}/${uuidv4()}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return { url: urlData.publicUrl, path: filePath };
  }

  static async deleteFile(filePath: string): Promise<void> {
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);
    if (error) throw new Error(`Delete failed: ${error.message}`);
  }

  static getPublicUrl(filePath: string): string {
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return data.publicUrl;
  }
}
