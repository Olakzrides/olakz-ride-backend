import { Router } from 'express';
import { SupportController } from '../controllers/support.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const supportController = new SupportController();

// All support routes require authentication
router.use(authenticate);

// Generate WhatsApp support link
router.post('/contact', supportController.contactSupport);

// Get support contact information
router.get('/info', supportController.getSupportInfo);

export default router;
