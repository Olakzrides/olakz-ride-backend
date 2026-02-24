import { Router } from 'express';
import { LocationsController } from '../controllers/locations.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const locationsController = new LocationsController();

// All location routes require authentication
router.use(authenticate);

// Get place autocomplete suggestions
router.get('/autocomplete', locationsController.getAutocomplete);

// Get place details by place_id
router.get('/place-details', locationsController.getPlaceDetails);

// Geocode an address to coordinates
router.get('/geocode', locationsController.geocodeAddress);

// Reverse geocode coordinates to address
router.get('/reverse-geocode', locationsController.reverseGeocode);

export default router;
