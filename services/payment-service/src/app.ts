import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import walletRoutes from './routes/wallet.routes';
import cardsRoutes from './routes/cards.routes';
import internalRoutes from './routes/internal.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.cors.allowedOrigins, credentials: true }));
app.use(express.json());
app.use(morgan('combined'));

// Health check — accessible both directly and via gateway
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'payment-service',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/payment/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'payment-service',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// User-facing routes
app.use('/api/payment/wallet', walletRoutes);
app.use('/api/payment/cards', cardsRoutes);

// Internal service-to-service routes
app.use('/api/internal/payment', internalRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

export default app;
