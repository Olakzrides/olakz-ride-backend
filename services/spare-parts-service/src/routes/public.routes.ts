import { Router } from 'express';
import { StoreController } from '../controllers/store.controller';

const router = Router();
const storeCtrl = new StoreController();

// Categories
router.get('/categories', storeCtrl.listCategories);

// Stores
router.get('/stores',                storeCtrl.listStores);
router.get('/stores/:id',            storeCtrl.getStore);
router.get('/stores/:id/products',   storeCtrl.getStoreProducts);
router.get('/stores/:id/reviews',    storeCtrl.getStoreReviews);

// Products
router.get('/products/:id',          storeCtrl.getProduct);
router.get('/products/:id/similar',  storeCtrl.getSimilarProducts);
router.get('/products/:id/reviews',  storeCtrl.getProductReviews);

// Search
router.get('/search',                storeCtrl.search);

// Delivery fee estimate for a store → delivery address
router.get('/delivery-options',      storeCtrl.getDeliveryOptions);

export default router;
