import { Router } from 'express';
import { DriverRegistrationController } from '../controllers/driver-registration.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload, handleMulterError } from '../middleware/upload.middleware';
import { 
  registrationRateLimit, 
  strictRegistrationRateLimit, 
  documentUploadRateLimit 
} from '../middleware/rate-limit-registration.middleware';

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

// Multi-step registration endpoints (AUTHENTICATED + RATE LIMITED)
router.post('/register/initiate', 
  authenticate, 
  strictRegistrationRateLimit.strictInitiationLimit, 
  driverRegistrationController.initiateRegistration
);

router.post('/register/:id/personal-info', 
  authenticate, 
  registrationRateLimit.middleware, 
  driverRegistrationController.submitPersonalInfo
);

router.post('/register/:id/vehicle-details', 
  authenticate, 
  registrationRateLimit.middleware, 
  driverRegistrationController.submitVehicleDetails
);

router.post('/register/:id/documents', 
  authenticate, 
  documentUploadRateLimit.documentUploadLimit,
  upload.array('documents', 10), // Allow up to 10 files
  handleUploadErrors,
  driverRegistrationController.uploadDocuments
);

router.post('/register/:id/submit', 
  authenticate, 
  registrationRateLimit.middleware, 
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