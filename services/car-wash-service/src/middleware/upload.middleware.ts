import multer from 'multer';
import { Request } from 'express';
import { config } from '../config/env';

const storage = multer.memoryStorage();

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedExts  = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

  const mimeOk = allowedMimes.includes(file.mimetype) || file.mimetype === 'application/octet-stream';
  const extOk  = allowedExts.includes(ext);

  if (!mimeOk || !extOk) {
    return cb(new Error(`Invalid file type. Allowed formats: jpg, jpeg, png, webp`));
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: config.booking.maxVehiclePhotos,
  },
});

export const vendorUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for vendor images
    files: 5,
  },
});

export const handleMulterError = (error: any): string => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE': return 'File size exceeds the limit';
      case 'LIMIT_FILE_COUNT': return `Too many files. Maximum ${config.booking.maxVehiclePhotos} allowed`;
      case 'LIMIT_UNEXPECTED_FILE': return 'Unexpected file field';
      default: return `Upload error: ${error.message}`;
    }
  }
  return error.message || 'Unknown upload error';
};
