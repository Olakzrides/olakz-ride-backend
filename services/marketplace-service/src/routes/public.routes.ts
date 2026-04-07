import { Router } from 'express';
import { StoreController } from '../controllers/store.controller';
import { ReviewController } from '../controllers/review.controller';

const router = Router();
const storeCtrl = new StoreController();
const reviewCtrl = new ReviewController();

router.get('/categories', storeCtrl.listCategories);
router.get('/stores', storeCtrl.listStores);
router.get('/stores/:id', storeCtrl.getStore);
router.get('/stores/:id/products', storeCtrl.getStoreProducts);
router.get('/stores/:id/reviews', reviewCtrl.getStoreReviews);
router.get('/products/:id', storeCtrl.getProduct);
router.get('/products/:id/similar', storeCtrl.getSimilarProducts);
router.get('/products/:id/reviews', reviewCtrl.getProductReviews);
router.get('/search', storeCtrl.search);

export default router;
