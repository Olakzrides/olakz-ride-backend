import { Router } from 'express';
import helpController from '../controllers/help.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/faqs', helpController.getFaqs);
router.get('/tickets', helpController.getTickets);
router.post('/tickets', helpController.createTicket);
router.get('/tickets/:ticketId/messages', helpController.getMessages);
router.post('/tickets/:ticketId/messages', helpController.sendMessage);

export default router;
