import { Router } from 'express';
import { VendorRegistrationController } from '../controllers/vendor-registration.controller';
import { authenticate } from '../middleware/auth.middleware';
import { adminAuthMiddleware } from '../middleware/admin.middleware';
import { internalApiMiddleware } from '../middleware/internal-api.middleware';
import { VendorRegistrationService } from '../services/vendor-registration.service';
import ResponseUtil from '../utils/response';

const router = Router();
const ctrl = new VendorRegistrationController();

// Vendor self-service routes (authenticated)
router.post('/register', authenticate, ctrl.register);
router.put('/register/documents', authenticate, ctrl.submitDocuments);
router.get('/register/status', authenticate, ctrl.getStatus);
router.get('/register/upload-url', authenticate, ctrl.getUploadUrl);

// Internal route for food-service to check vendor approval status
router.get('/internal/status/:userId', internalApiMiddleware, async (req, res) => {
  try {
    const approved = await VendorRegistrationService.isApproved(req.params.userId);
    return ResponseUtil.success(res, 'Status retrieved', { approved });
  } catch (err: any) {
    return ResponseUtil.serverError(res, err.message);
  }
});

// Admin routes
router.get('/admin/vendors', adminAuthMiddleware, ctrl.adminGetAll);
router.put('/admin/vendors/:id/approve', adminAuthMiddleware, ctrl.adminApprove);
router.put('/admin/vendors/:id/reject', adminAuthMiddleware, ctrl.adminReject);

export default router;
