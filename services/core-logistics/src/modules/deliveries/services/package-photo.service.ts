import { logger } from '../../../config/logger';
import { StorageUtil } from '../../../utils/storage.util';

export interface PhotoUploadResult {
  success: boolean;
  message: string;
  photoUrl?: string;
  error?: string;
}

export interface SignedUploadUrlResult {
  success: boolean;
  message: string;
  uploadUrl?: string;
  photoUrl?: string;
  filePath?: string;
  expiresIn?: number;
  maxFileSize?: number;
  error?: string;
}

/**
 * PackagePhotoService
 * Handles package photo upload and validation for deliveries
 */
export class PackagePhotoService {
  private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private static readonly ALLOWED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png'];
  private static readonly SIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

  /**
   * Generate signed upload URL for direct client-to-storage upload
   */
  static async generateSignedUploadUrl(params: {
    fileName: string;
    fileType: string;
    fileSize: number;
    customerId: string;
  }): Promise<SignedUploadUrlResult> {
    try {
      const { fileName, fileType, fileSize, customerId } = params;

      // Validate file size
      if (fileSize > this.MAX_FILE_SIZE) {
        return {
          success: false,
          message: `File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`,
          error: 'FILE_TOO_LARGE',
        };
      }

      // Validate file type
      if (!this.ALLOWED_FORMATS.includes(fileType)) {
        return {
          success: false,
          message: `Invalid file type. Allowed formats: JPG, PNG`,
          error: 'INVALID_FILE_TYPE',
        };
      }

      // Generate unique file path
      const timestamp = Date.now();
      const fileExtension = fileName.split('.').pop() || 'jpg';
      const sanitizedFileName = `package_${timestamp}.${fileExtension}`;
      const filePath = `delivery-packages/${customerId}/${sanitizedFileName}`;

      // Generate signed upload URL
      const uploadUrl = await StorageUtil.generateSignedUploadUrl(filePath);

      // Generate the public URL (what will be accessible after upload)
      const photoUrl = StorageUtil.getPublicUrl(filePath);

      logger.info('Generated signed upload URL for package photo:', {
        customerId,
        filePath,
        fileSize,
        expiresIn: this.SIGNED_URL_EXPIRY,
      });

      return {
        success: true,
        message: 'Upload URL generated successfully',
        uploadUrl,
        photoUrl,
        filePath,
        expiresIn: this.SIGNED_URL_EXPIRY,
        maxFileSize: this.MAX_FILE_SIZE,
      };
    } catch (error: any) {
      logger.error('Generate signed upload URL error:', error);
      return {
        success: false,
        message: 'Failed to generate upload URL',
        error: error.message,
      };
    }
  }

  /**
   * Validate photo file
   */
  static validatePhoto(file: Express.Multer.File): { valid: boolean; error?: string } {
    // Check if file exists
    if (!file) {
      return { valid: false, error: 'No photo file provided' };
    }

    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`,
      };
    }

    // Check file format
    if (!this.ALLOWED_FORMATS.includes(file.mimetype)) {
      return {
        valid: false,
        error: `Invalid file format. Allowed formats: ${this.ALLOWED_FORMATS.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Upload package photo to storage
   */
  static async uploadPackagePhoto(params: {
    file: Express.Multer.File;
    deliveryId: string;
    customerId: string;
  }): Promise<PhotoUploadResult> {
    try {
      const { file, deliveryId, customerId } = params;

      // Validate photo
      const validation = this.validatePhoto(file);
      if (!validation.valid) {
        return {
          success: false,
          message: validation.error || 'Photo validation failed',
        };
      }

      // Generate folder path
      const folder = `delivery-packages/${customerId}/${deliveryId}`;

      // Upload to storage using StorageUtil
      const uploadResult = await StorageUtil.uploadFile(file, folder);

      logger.info('Package photo uploaded successfully:', {
        deliveryId,
        customerId,
        fileSize: file.size,
        url: uploadResult.url,
      });

      return {
        success: true,
        message: 'Package photo uploaded successfully',
        photoUrl: uploadResult.url,
      };
    } catch (error: any) {
      logger.error('Upload package photo error:', error);
      return {
        success: false,
        message: 'Failed to upload package photo',
        error: error.message,
      };
    }
  }

  /**
   * Delete package photo from storage
   */
  static async deletePackagePhoto(photoUrl: string): Promise<{ success: boolean; message: string }> {
    try {
      // Extract file path from URL
      // URL format: https://...supabase.co/storage/v1/object/public/bucket/path/to/file.jpg
      const urlParts = photoUrl.split('/storage/v1/object/public/');
      if (urlParts.length < 2) {
        return {
          success: false,
          message: 'Invalid photo URL format',
        };
      }

      const pathWithBucket = urlParts[1];
      const pathParts = pathWithBucket.split('/');
      // Remove bucket name (first part) to get the file path
      const filePath = pathParts.slice(1).join('/');

      await StorageUtil.deleteFile(filePath);

      logger.info('Package photo deleted successfully:', {
        photoUrl,
        filePath,
      });

      return {
        success: true,
        message: 'Package photo deleted successfully',
      };
    } catch (error: any) {
      logger.error('Delete package photo error:', error);
      return {
        success: false,
        message: 'Failed to delete package photo',
      };
    }
  }

  /**
   * Get photo file info
   */
  static getPhotoInfo(file: Express.Multer.File): {
    size: number;
    sizeInMB: string;
    format: string;
    originalName: string;
  } {
    return {
      size: file.size,
      sizeInMB: (file.size / (1024 * 1024)).toFixed(2),
      format: file.mimetype,
      originalName: file.originalname,
    };
  }
}
