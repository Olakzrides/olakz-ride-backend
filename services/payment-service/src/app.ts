import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import { ResponseUtil } from './utils/response';
import walletRoutes from './routes/wallet.routes';
import cardsRoutes from './routes/cards.routes';
import bankAccountsRoutes from './routes/bank-accounts.routes';
import banksRoutes from './routes/banks.routes';
import withdrawalsRoutes from './routes/withdrawals.routes';
import internalRoutes from './routes/internal.routes';
import { WithdrawalsController } from './controllers/withdrawals.controller';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.cors.allowedOrigins, credentials: true }));
// Raw body needed for webhook signature verification
app.use('/api/payment/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(morgan('combined'));

// Health check
app.get('/health', (_req, res) => {
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
app.use('/api/payment/bank-accounts', bankAccountsRoutes);
app.use('/api/payment/banks', banksRoutes);
app.use('/api/payment/withdrawals', withdrawalsRoutes);

// Flutterwave webhook — no JWT, raw body, verified by hash
const withdrawalsCtrl = new WithdrawalsController();
app.post('/api/payment/webhooks/flutterwave', withdrawalsCtrl.flutterwaveWebhook);

// Internal service-to-service routes
app.use('/api/internal/payment', internalRoutes);

// 404
app.use((req, res) => {
  ResponseUtil.notFound(res, `Route ${req.originalUrl}`);
});

export default app;
