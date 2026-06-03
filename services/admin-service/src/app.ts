import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import { ResponseUtil } from './utils/response';
import driverRoutes from './routes/drivers.routes';
import documentRoutes from './routes/documents.routes';
import deliveryRoutes from './routes/delivery.routes';
import foodRoutes from './routes/food.routes';
import marketplaceRoutes from './routes/marketplace.routes';
import vendorRoutes from './routes/vendors.routes';
import userRoutes from './routes/users.routes';
import ordersRoutes from './routes/orders.routes';
import notificationsRoutes from './routes/notifications.routes';
import pricingRoutes from './routes/pricing.routes';
import paymentsRoutes from './routes/payments.routes';
import ridesRoutes from './routes/rides.routes';
import deliveriesOrdersRoutes from './routes/deliveries-orders.routes';
import remittanceRoutes from './routes/remittance.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.cors.allowedOrigins, credentials: true }));
app.use(express.json());
app.use(morgan('combined'));

// Health check (public — no auth required)
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'admin-service',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Step 2: core-logistics admin features
app.use('/api/admin/drivers', driverRoutes);
app.use('/api/admin/documents', documentRoutes);
app.use('/api/admin/delivery', deliveryRoutes);

// Step 3: food-service admin features
app.use('/api/admin/food', foodRoutes);

// Step 4: marketplace-service admin features
app.use('/api/admin/marketplace', marketplaceRoutes);

// Step 5: platform-service vendor registration admin features
app.use('/api/admin/vendors', vendorRoutes);

// Step 6: auth-service user role management
app.use('/api/admin/users', userRoutes);

// Step 7: cross-service orders aggregation
app.use('/api/admin/orders', ordersRoutes);

// Step 8: admin notifications
app.use('/api/admin/notifications', notificationsRoutes);

// Step 9: ride pricing config (admin-managed fare settings)
app.use('/api/admin/pricing', pricingRoutes);

// Step 10: driver remittance management
app.use('/api/admin/remittance', remittanceRoutes);

// Step 11: payment transactions
app.use('/api/admin/payments', paymentsRoutes);

// Step 12: ride orders management
app.use('/api/admin/rides', ridesRoutes);

// Step 13: delivery orders management
app.use('/api/admin/deliveries', deliveriesOrdersRoutes);

// 404
app.use((req, res) => {
  ResponseUtil.notFound(res, `Route ${req.originalUrl}`);
});

export default app;
