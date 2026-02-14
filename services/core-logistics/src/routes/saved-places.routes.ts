import { Router } from 'express';
import { SavedPlacesController } from '../controllers/saved-places.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const savedPlacesController = new SavedPlacesController();

// All saved places routes require authentication
router.use(authenticate);

// Get user's saved places
router.get('/saved-places', savedPlacesController.getSavedPlaces);

// Create saved place
router.post('/saved-places', savedPlacesController.createSavedPlace);

// Update saved place
router.put('/saved-places/:id', savedPlacesController.updateSavedPlace);

// Delete saved place
router.delete('/saved-places/:id', savedPlacesController.deleteSavedPlace);

// Set place as default
router.post('/saved-places/:id/set-default', savedPlacesController.setDefaultPlace);

export default router;
