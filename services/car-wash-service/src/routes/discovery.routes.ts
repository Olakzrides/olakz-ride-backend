import { Router } from 'express';
import { DiscoveryController } from '../controllers/discovery.controller';

const router = Router();
const ctrl = new DiscoveryController();

// All public — no auth required
router.get('/categories',      ctrl.getCategories);
router.get('/vendors/top-rated', ctrl.getTopRated);
router.get('/vendors/nearby',    ctrl.getNearby);
router.get('/vendors/search',    ctrl.search);

export default router;
