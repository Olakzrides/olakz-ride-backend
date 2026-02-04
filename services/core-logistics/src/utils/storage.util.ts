import { supabase } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export class StorageUtil {
  private static readonly BUCKET_NAME = 'driver-documents';
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];

  /**
   * Initialize storage bucket if it doesn't exist
   */
  static async initializeBucket(): Promise<void> {
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets?.some(b => b.name === this.BUCKET_NAME);

      if (!bucketExists) {
        console.log(`Creating private bucket: ${this.BUCKET_NAME}`);
        const { error } = await supabase.storage.createBucket(this.BUCKET_NAME, {
          public: false, // Private bucket for security
          fileSizeLimit: this.MAX_FILE_SIZE,
        });
        
        if (error) {
          console.error('Error creating bucket:', error);
        } else {
          console.log(`Private bucket ${this.BUCKET_NAME} created successfully`);
        }
      } else {
        // Update existing bucket to be private for security
        const { error } = await supabase.storage.updateBucket(this.BUCKET_NAME, {
          public: false, // Ensure privacy
          fileSizeLimit: this.MAX_FILE_SIZE,
        });
        
        if (error) {
          console.error('Error updating bucket to private:', error);
        } else {
          console.log(`Bucket ${this.BUCKET_NAME} updated to private for security`);
        }
      }
    } catch (error) {
      console.error('Error initializing storage bucket:', error);
    }
  }

  /**
   * Upload a file to Supabase Storage
   */
  static async uploadFile(
    file: Express.Multer.File,
    folder: string
  ): Promise<{ url: string; path: string; signedUrl: string }> {
    // Validate file size
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Validate MIME type
    if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new Error(`File type ${file.mimetype} is not allowed`);
    }

    // Enhanced file validation
    const validationResult = await this.validateFileContent(file);
    if (!validationResult.isValid) {
      throw new Error(validationResult.error);
    }

    // Generate unique filename
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    // Generate signed URL for secure access (24 hours expiry)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(this.BUCKET_NAME)
      .createSignedUrl(filePath, 24 * 60 * 60); // 24 hours

    if (signedUrlError) {
      throw new Error(`Failed to generate signed URL: ${signedUrlError.message}`);
    }

    // For backward compatibility, also generate public URL (will not work with private bucket)
    const { data: urlData } = supabase.storage
      .from(this.BUCKET_NAME)
      .getPublicUrl(filePath);

    return {
      url: urlData.publicUrl, // Keep for backward compatibility
      path: filePath,
      signedUrl: signedUrlData.signedUrl, // Secure access URL
    };
  }

  /**
   * Delete a file from Supabase Storage
   */
  static async deleteFile(filePath: string): Promise<void> {
    const { error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get signed URL for private file access
   */
  static async getSignedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Enhanced file content validation
   */
  static async validateFileContent(file: Express.Multer.File): Promise<{ isValid: boolean; error?: string }> {
    try {
      // Check file header/magic bytes for common file types
      const fileHeader = file.buffer.slice(0, 10);
      const headerHex = fileHeader.toString('hex').toUpperCase();
      
      // PDF validation
      if (file.mimetype === 'application/pdf') {
        if (!headerHex.startsWith('255044462D')) { // %PDF-
          return { isValid: false, error: 'Invalid PDF file: File header does not match PDF format' };
        }
      }
      
      // JPEG validation
      if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
        if (!headerHex.startsWith('FFD8FF')) {
          return { isValid: false, error: 'Invalid JPEG file: File header does not match JPEG format' };
        }
      }
      
      // PNG validation
      if (file.mimetype === 'image/png') {
        if (!headerHex.startsWith('89504E470D0A1A0A')) {
          return { isValid: false, error: 'Invalid PNG file: File header does not match PNG format' };
        }
      }
      
      // WebP validation
      if (file.mimetype === 'image/webp') {
        if (!headerHex.includes('57454250')) { // WEBP
          return { isValid: false, error: 'Invalid WebP file: File header does not match WebP format' };
        }
      }
      
      // Check for executable file signatures (security)
      const dangerousHeaders = [
        '4D5A', // PE/EXE files
        '7F454C46', // ELF files
        'CAFEBABE', // Java class files
        '504B0304', // ZIP files (could contain executables)
      ];
      
      for (const dangerousHeader of dangerousHeaders) {
        if (headerHex.startsWith(dangerousHeader)) {
          return { isValid: false, error: 'Security violation: Executable or archive files are not allowed' };
        }
      }
      
      // File size validation per document type
      const maxSizes = {
        'application/pdf': 10 * 1024 * 1024, // 10MB for PDFs
        'image/jpeg': 5 * 1024 * 1024, // 5MB for images
        'image/jpg': 5 * 1024 * 1024,
        'image/png': 5 * 1024 * 1024,
        'image/webp': 5 * 1024 * 1024,
      };
      
      const maxSize = maxSizes[file.mimetype as keyof typeof maxSizes] || this.MAX_FILE_SIZE;
      if (file.size > maxSize) {
        return { 
          isValid: false, 
          error: `File size exceeds limit for ${file.mimetype}: ${maxSize / 1024 / 1024}MB` 
        };
      }
      
      return { isValid: true };
      
    } catch (error) {
      return { isValid: false, error: `File validation error: ${error}` };
    }
  }

  /**
   * Validate file before upload (legacy method for backward compatibility)
   */
  static validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return {
        valid: false,
        error: `File type ${file.mimetype} is not allowed. Allowed types: ${this.ALLOWED_MIME_TYPES.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Generate a new signed URL for an existing file
   */
  static async refreshSignedUrl(filePath: string, expiresIn: number = 24 * 60 * 60): Promise<string> {
    const { data, error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }
}