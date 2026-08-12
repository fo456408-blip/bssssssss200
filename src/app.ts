import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import apiRouter from './routes/api.router';
import { errorMiddleware } from './middleware/error.middleware';
import { globalRateLimiter } from './middleware/rateLimiter.middleware';
import { ApiError } from './utils/apiError';

const app: Application = express();
app.set('trust proxy', 1);

// Security HTTP headers
app.use(helmet());

const allowedOrigins = [
  config.corsOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://ahmedhamed.online',
  'https://www.ahmedhamed.online',
];

// Enable CORS for local dev IPs, localhost, 127.0.0.1, and configured origin
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return callback(null, true);

      if (
        config.env === 'development' ||
        allowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

import { cookieParserMiddleware } from './middleware/cookieParser.middleware';

// Rate Limiting
app.use(globalRateLimiter);

// Cookie Parser & Body Parser
app.use(cookieParserMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mount API Routes
app.use(config.apiPrefix, apiRouter);

// Handle 404 Route Not Found
app.use((_req: Request, _res: Response, next) => {
  next(ApiError.notFound('Requested API endpoint does not exist'));
});

// Centralized Error Handling Middleware
app.use(errorMiddleware);

export default app;
