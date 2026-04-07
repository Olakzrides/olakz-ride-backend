import { Router } from 'express';
import { InternalController } from '../controllers/internal.controller';
import { internalApiAuth } from '../middleware/internal-api.middleware';

const router = Router();
const internalCtrl = new InternalController();

router.use(internalApiAuth);
router.post('/vendor/provision', internalCtrl.provisionVendor);

export default router;
