import multer from 'multer';
import { Request } from 'express';

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter with enhanced validation
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allowed mime types
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/webp',
    'application/pdf',
  ];

  // Check mime type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`));
  }

  // Check file extension
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
  const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  
  if (!allowedExtensions.includes(fileExtension)) {
    return cb(new Error(`Invalid file extension: ${fileExtension}. Allowed extensions: ${allowedExtensions.join(', ')}`));
  }

  cb(null, true);
};

// Multer configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10, // Maximum 10 files per request
  },
});

// Error handler for multer errors
export const handleMulterError = (error: any) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return 'File size exceeds 10MB limit';
      case 'LIMIT_FILE_COUNT':
        return 'Too many files. Maximum 10 files allowed';
      case 'LIMIT_UNEXPECTED_FILE':
        return 'Unexpected file field';
      default:
        return `Upload error: ${error.message}`;
    }
  }
  return error.message || 'Unknown upload error';
};
