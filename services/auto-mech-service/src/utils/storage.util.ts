import { supabase } from '../config/database';
import { config } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

const BUCKET_NAME = config.supabase.storageBucket;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/** Map extension → proper MIME for octet-stream uploads (e.g. Postman) */
const EXT_TO_MIME: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
};

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

    const ext = ('.' + (file.originalname.split('.').pop() ?? '')).toLowerCase();

    // Accept proper image MIME types OR octet-stream with a valid image extension
    const mimeOk = ALLOWED_MIME_TYPES.includes(file.mimetype) || file.mimetype === 'application/octet-stream';
    const extOk  = ALLOWED_EXTENSIONS.includes(ext);

    if (!mimeOk || !extOk) {
      throw new Error(`File type not allowed. Accepted formats: jpg, jpeg, png, webp`);
    }

    // Resolve actual content type — fall back to extension map for octet-stream
    const contentType = ALLOWED_MIME_TYPES.includes(file.mimetype)
      ? file.mimetype
      : (EXT_TO_MIME[ext] ?? 'image/jpeg');

    const filePath = `${folder}/${uuidv4()}${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file.buffer, { contentType, upsert: false });

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
