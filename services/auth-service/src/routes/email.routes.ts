import { Router } from 'express';
import { EmailController } from '../controllers/email.controller';
import { internalApiAuth } from '../middleware/internal-api.middleware';

const router = Router();
const emailController = new EmailController();

/**
 * @route   POST /api/auth/send-email
 * @desc    Send email (internal API for other services)
 * @access  Internal (requires internal API key)
 */
router.post('/send-email', internalApiAuth, emailController.sendEmail);

export default router;
