import { Router } from 'express';
import { CardsController } from '../controllers/cards.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const ctrl = new CardsController();

router.use(authenticate);

router.get('/', ctrl.listCards);
router.post('/', ctrl.addCard);
router.post('/validate', ctrl.validateCardAddition);
router.get('/:id', ctrl.getCard);
router.delete('/:id', ctrl.deleteCard);
router.patch('/:id/default', ctrl.setDefault);

export default router;
