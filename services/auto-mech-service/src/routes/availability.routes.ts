import { Router } from 'express';
import { AvailabilityController } from '../controllers/availability.controller';

const router = Router();
const ctrl = new AvailabilityController();

// Public — no auth required to browse availability
router.get(
  '/vendors/:vendorId/services/:serviceId/availability',
  ctrl.getDayAvailability
);

router.get(
  '/vendors/:vendorId/services/:serviceId/availability/multi',
  ctrl.getMultiDayAvailability
);

export default router;
