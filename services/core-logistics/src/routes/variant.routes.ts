import { Router } from 'express';
import { VariantController } from '../controllers/variant.controller';

const router = Router();
const variantController = new VariantController();

// Public routes (no authentication required for browsing variants)

// Get all active variants
router.get('/variants', variantController.getActiveVariants);

// Get ride product by handle
router.get('/products/:handle', variantController.getRideProductByHandle);

// Get variant by ID
router.get('/variants/:variantId', variantController.getVariant);

export default router;
