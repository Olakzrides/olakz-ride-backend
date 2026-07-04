import { Router } from 'express';
import { HireController } from '../controllers/hire.controller';
import { authenticate } from '../middleware/auth.middleware';

const router  = Router();
const ctrl    = new HireController();

// All hire routes require authentication
router.use(authenticate);

// ── Customer — catalogue & home ──────────────────────────────────────────────
router.get('/hire/vehicle-types',  ctrl.getVehicleTypes);   // GET /api/hire/vehicle-types
router.get('/hire/home',           ctrl.getHomeData);        // GET /api/hire/home
router.get('/hire/history',        ctrl.getHireHistory);     // GET /api/hire/history

// ── Driver — requests (MUST be before :hireId routes) ────────────────────────
router.get('/hire/driver/active',                        ctrl.getDriverActiveHires);    // GET
router.get('/hire/driver/history',                       ctrl.getDriverHireHistory);    // GET
router.get('/hire/driver/requests',                      ctrl.getDriverRequests);       // GET
router.post('/hire/driver/requests/:hireId/accept',      ctrl.driverAcceptHire);        // POST
router.post('/hire/driver/requests/:hireId/reject',      ctrl.driverRejectHire);        // POST

// ── Driver — lifecycle actions (REST, same pattern as regular rides) ──────────
router.post('/hire/driver/:hireId/arrived',  ctrl.driverMarkArrived);   // POST — driver arrived at pickup
router.post('/hire/driver/:hireId/start',    ctrl.driverStartTrip);     // POST — driver starts trip
router.post('/hire/driver/:hireId/complete', ctrl.driverCompleteHire);  // POST — driver completes hire

// ── Customer — booking lifecycle ─────────────────────────────────────────────
router.post('/hire',               ctrl.createHire);         // POST /api/hire
router.put('/hire/:hireId',        ctrl.updateHire);         // PUT  /api/hire/:hireId
router.get('/hire/:hireId',        ctrl.getHireById);        // GET  /api/hire/:hireId
router.get('/hire/:hireId/driver', ctrl.getHireDriver);      // GET  /api/hire/:hireId/driver
router.post('/hire/:hireId/proceed', ctrl.proceedHire);      // POST /api/hire/:hireId/proceed
router.post('/hire/:hireId/cancel',  ctrl.cancelHire);       // POST /api/hire/:hireId/cancel

export default router;