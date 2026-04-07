import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import 'express-async-errors';
import { setupRoutes } from './routes';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';
import logger from './utils/logger';

const app: Application = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const level = res.statusCode >= 400 ? 'error' : 'info';
    logger.log(level, 'Request completed', { method: req.method, url: req.url, status: res.statusCode, duration: `${Date.now() - start}ms` });
  });
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'marketplace-service', version: '1.0.0', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

setupRoutes(app);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
