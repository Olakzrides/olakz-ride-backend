import { Router } from 'express';
import { DriverRegistrationController } from '../controllers/driver-registration.controller';
import { authenticate } from '../middleware/auth.middleware';
import { 
  registrationRateLimit, 
  strictRegistrationRateLimit, 
  documentUploadRateLimit 
} from '../middleware/rate-limit-registration.middleware';

const router = Router();
const driverRegistrationController = new DriverRegistrationController();

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

export default router;