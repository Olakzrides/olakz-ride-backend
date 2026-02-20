import { Router } from 'express';
import { DriverRegistrationController } from '../controllers/driver-registration.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload, handleMulterError } from '../middleware/upload.middleware';

const router = Router();
const driverRegistrationController = new DriverRegistrationController();

// Multer error handling middleware
const handleUploadErrors = (err: any, _req: any, res: any, next: any) => {
  if (err) {
    const errorMessage = handleMulterError(err);
    return res.status(400).json({
      success: false,
      error: {
        code: 'DOCUMENT_UPLOAD_FAILED',
        message: errorMessage,
        field: 'documents',
        timestamp: new Date().toISOString(),
      },
    });
  }
  next();
};

// Phase 1: Vehicle Types and Service Capabilities (PUBLIC - no auth required)
router.get('/vehicle-types', driverRegistrationController.getVehicleTypes);

// Phase 3: Vehicle-specific form configuration (PUBLIC)
router.get('/vehicle-types/:vehicleType/form-config', driverRegistrationController.getVehicleFormConfig);

// Document Requirements (temporary endpoint for testing)
router.get('/register/:registrationId/documents/requirements', driverRegistrationController.getDocumentRequirements);

// Multi-step registration endpoints (AUTHENTICATED - NO RATE LIMITING)
router.post('/register/initiate', 
  authenticate, 
  driverRegistrationController.initiateRegistration
);

router.post('/register/:id/personal-info', 
  authenticate, 
  driverRegistrationController.submitPersonalInfo
);

router.post('/register/:id/vehicle-details', 
  authenticate, 
  driverRegistrationController.submitVehicleDetails
);

router.post('/register/:id/documents', 
  authenticate, 
  upload.any(), // Accept any field names (e.g., national_id, passport_photo, bicycle_photos)
  handleUploadErrors,
  driverRegistrationController.uploadDocuments
);

// In src/routes/driver-registration.routes.ts
router.post('/register/:id/submit', 
  authenticate,
  (req, res, next) => {
    // Extend timeout for this specific endpoint
    req.setTimeout(120000); // 2 minutes
    res.setTimeout(120000);
    next();
  },
  driverRegistrationController.submitRegistration
);

router.get('/register/:id/status', 
  authenticate, 
  driverRegistrationController.getRegistrationStatus
);

router.post('/register/resume', 
  authenticate, 
  driverRegistrationController.resumeRegistration
);

// Secure document access endpoint
router.get('/documents/:documentId/url',
  authenticate,
  driverRegistrationController.getDocumentUrl
);

export default router;